-- KANBAN FLOW LAB / MULTIPLAYER
-- Paste into Supabase > SQL Editor > New query > Run.
-- Rooms are temporary. All mutations are validated on the database server.
create table if not exists public.kanban_mp_rooms (
  code text primary key,
  host_secret uuid not null,
  members jsonb not null default '[]'::jsonb,
  game jsonb not null,
  expires_at timestamptz not null default (now() + interval '4 hours'),
  updated_at timestamptz not null default now()
);
create index if not exists kanban_mp_rooms_expires_idx on public.kanban_mp_rooms(expires_at);
alter table public.kanban_mp_rooms enable row level security;
revoke all on public.kanban_mp_rooms from anon, authenticated, public;

create or replace function public.mp_blank_tasks()
returns jsonb language sql stable as $$
 select jsonb_agg(jsonb_build_object('id',n,'status',0,'owner',null,'blocked',false,'started',null,'finished',null) order by n)
 from generate_series(1,30) n;
$$;

-- Legal moves computed from the shared state, not from the calling browser.
create or replace function public.mp_legal(g jsonb, p integer)
returns jsonb language plpgsql stable as $$
declare
  d int := (g->>'day')::int;
  n int := (g->>'capacity')::int;
  turn_no int := (g->>'turn')::int;
  lim int := case when d<=10 then 10000 when d<=30 then 3 else (g->>'wip')::int end;
  working_count int; review_count int;
  card jsonb;
  red boolean;
  step_name text := coalesce(g->>'step','block');
  t jsonb; s int; own int; blocked boolean; taskid int;
  own_moves jsonb := '[]'::jsonb; pulls jsonb := '[]'::jsonb;
  blocks jsonb := '[]'::jsonb; helps jsonb := '[]'::jsonb;
  move_item jsonb;
begin
 if g->>'gate' <> 'playing' or turn_no <> p then return '[]'::jsonb; end if;
 card := g->'cards'->(((d-1)%10)*n+p-1);
 red := (card->>'red')::boolean;
 select count(*) filter (where (v->>'status')::int=1), count(*) filter (where (v->>'status')::int=2)
 into working_count,review_count from jsonb_array_elements(g->'tasks') v;
 for t in select value from jsonb_array_elements(g->'tasks') loop
   s := (t->>'status')::int;
   own := nullif(t->>'owner','null')::int;
   blocked := (t->>'blocked')::boolean;
   taskid := (t->>'id')::int;
   if s=0 and working_count<lim then
     pulls := pulls || jsonb_build_array(jsonb_build_object('type','pull','id',taskid));
   end if;
   if s in (1,2) then
     if own=p then
       if blocked then
         own_moves := own_moves || jsonb_build_array(jsonb_build_object('type','unblock','id',taskid));
       else
         blocks := blocks || jsonb_build_array(jsonb_build_object('type','block','id',taskid));
         if s=2 or review_count<lim then
           own_moves := own_moves || jsonb_build_array(jsonb_build_object('type','advance','id',taskid));
         end if;
       end if;
     elsif own is not null then
       if blocked then
         helps := helps || jsonb_build_array(jsonb_build_object('type','helpUnblock','id',taskid));
       elsif s=2 or review_count<lim then
         helps := helps || jsonb_build_array(jsonb_build_object('type','helpAdvance','id',taskid));
       end if;
     end if;
   end if;
 end loop;
 if red then
   if jsonb_array_length(own_moves)+jsonb_array_length(pulls)>0 then return own_moves||pulls; end if;
   return helps;
 end if;
 if step_name='block' and jsonb_array_length(blocks)>0 then return blocks; end if;
 if jsonb_array_length(pulls)>0 then return pulls; end if;
 return helps;
end;
$$;

create or replace function public.mp_public(r public.kanban_mp_rooms)
returns jsonb language plpgsql stable as $$
declare m jsonb; safe_members jsonb := '[]'::jsonb;
begin
 for m in select value from jsonb_array_elements(r.members) loop
   safe_members:=safe_members||jsonb_build_array(m-'token');
 end loop;
 return jsonb_build_object('code',r.code,'players',safe_members,'game',r.game,'updated',r.updated_at);
end;
$$;

create or replace function public.mp_create(name text, avatar text, capacity integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  room_code text; secret uuid:=gen_random_uuid();
  cards jsonb; leaders jsonb; room public.kanban_mp_rooms;
  a text; b text;
begin
 if capacity not between 3 and 5 then raise exception 'Choose 3, 4 or 5 players'; end if;
 if length(trim(coalesce(name,''))) not between 1 and 32 then raise exception 'Enter a name (maximum 32 characters)'; end if;
 if avatar not in ('🧑‍🚀','🧙','🦊','🛡️','🐉','🦉','🐢','🐺') then avatar:='🧑‍🚀'; end if;
 -- An independently shuffled physical 52-card deck, reused every 10 days.
 select jsonb_agg(jsonb_build_object('suit',suit,'rank',rank,'red',suit in ('♥','♦')) order by rnd) into cards
 from (select suit,rank,random() rnd from unnest(array['♥','♦','♣','♠']) suit cross join unnest(array['A','2','3','4','5','6','7','8','9','10','J','Q','K']) rank) x;
 select jsonb_agg(case when d<=10 then 'null'::jsonb else to_jsonb(1+floor(random()*capacity)::int) end order by d)
 into leaders from generate_series(0,40) d;
 -- Cryptographically strong room code generated from a UUID; no sequential codes.
 room_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.kanban_mp_rooms(code,host_secret,members,game)
 values(room_code,secret,jsonb_build_array(jsonb_build_object('id',1,'name',trim(name),'avatar',avatar,'token',secret::text)),
 jsonb_build_object('capacity',capacity,'cards',cards,'leaders',leaders,'tasks',public.mp_blank_tasks(),
  'history',jsonb_build_array(jsonb_build_object('day',0,'tasks',public.mp_blank_tasks())),
  'day',1,'turn',1,'step','block','gate','lobby','phaseLength',null,'wip',3,'events','[]'::jsonb,'dsus','[]'::jsonb));
 select * into room from public.kanban_mp_rooms where code=room_code;
 return jsonb_build_object('code',room_code,'token',secret::text,'room',public.mp_public(room));
end;
$$;

create or replace function public.mp_join(room_code text, name text, avatar text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.kanban_mp_rooms; token uuid:=gen_random_uuid(); m jsonb; num int;
begin
 select * into r from public.kanban_mp_rooms where code=upper(trim(room_code)) and expires_at>now() for update;
 if not found then raise exception 'Room not found or expired'; end if;
 if r.game->>'gate'<>'lobby' then raise exception 'This game has already started'; end if;
 num := jsonb_array_length(r.members)+1;
 if num>(r.game->>'capacity')::int then raise exception 'The room is full'; end if;
 if length(trim(coalesce(name,''))) not between 1 and 32 then raise exception 'Enter a name (maximum 32 characters)'; end if;
 if avatar not in ('🧑‍🚀','🧙','🦊','🛡️','🐉','🦉','🐢','🐺') then avatar:='🧑‍🚀'; end if;
 m:=r.members||jsonb_build_array(jsonb_build_object('id',num,'name',trim(name),'avatar',avatar,'token',token::text));
 update public.kanban_mp_rooms set members=m,updated_at=now(),expires_at=now()+interval '4 hours' where code=r.code returning * into r;
 return jsonb_build_object('code',r.code,'token',token::text,'room',public.mp_public(r));
end;
$$;

create or replace function public.mp_get(room_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.kanban_mp_rooms;
begin
 select * into r from public.kanban_mp_rooms where code=upper(trim(room_code)) and expires_at>now();
 if not found then return null; end if;
 return public.mp_public(r);
end;
$$;

create or replace function public.mp_command(room_code text, actor_token uuid, kind text, task_id integer default null, val text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 r public.kanban_mp_rooms; g jsonb; member jsonb; who int:=null; host boolean;
 d int; n int; turn_no int; allowed jsonb; move jsonb; task jsonb;
 old_tasks jsonb; updated_tasks jsonb:='[]'::jsonb;
 s int; cap int; nextday int; newgate text; red boolean;
 display_text text; leader int;
begin
 select * into r from public.kanban_mp_rooms where code=upper(trim(room_code)) and expires_at>now() for update;
 if not found then raise exception 'Room not found or expired'; end if;
 g:=r.game;
 host:=(r.host_secret=actor_token);
 for member in select value from jsonb_array_elements(r.members) loop
   if member->>'token'=actor_token::text then who:=(member->>'id')::int; end if;
 end loop;
 if who is null then raise exception 'You are not a member of this room'; end if;
 d:=(g->>'day')::int; n:=(g->>'capacity')::int; turn_no:=(g->>'turn')::int;
 if kind in ('start','next','dsu','duration','wip') and not host then raise exception 'Only the host can advance the game'; end if;
 if kind='start' then
   if g->>'gate'<>'lobby' then raise exception 'Game has started'; end if;
   if jsonb_array_length(r.members)<>n then raise exception 'Wait for all players to join'; end if;
   g:=jsonb_set(g,'{gate}','"playing"');
 elsif kind='dsu' then
   if g->>'gate'<>'dsu' then raise exception 'Not at a DSU checkpoint'; end if;
   leader:=(g->'leaders'->>d)::int;
   g:=jsonb_set(g,'{dsus}',(g->'dsus')||jsonb_build_array(jsonb_build_object('day',d,'leader',leader,'notes',left(coalesce(val,''),500))));
   g:=jsonb_set(g,'{gate}','"playing"');
 elsif kind='duration' then
   if g->>'gate'<>'duration' then raise exception 'Not at Phase 3 decision'; end if;
   if val not in ('10','20') then raise exception 'Choose 10 or 20 days'; end if;
   g:=jsonb_set(g,'{phaseLength}',to_jsonb(val::int));
   g:=jsonb_set(g,'{tasks}',public.mp_blank_tasks());
   g:=jsonb_set(g,'{gate}','"dsu"');
 elsif kind='wip' then
   if g->>'gate'<>'wip' then raise exception 'Not at Day 31'; end if;
   if val is null or val !~ '^[345]$' or val::int>greatest(4,n) then raise exception 'Invalid WIP limit'; end if;
   g:=jsonb_set(g,'{wip}',to_jsonb(val::int));
   g:=jsonb_set(g,'{gate}','"dsu"');
 elsif kind='next' then
   if g->>'gate'<>'playing' or turn_no<=n then raise exception 'All players must finish their turns'; end if;
   g:=jsonb_set(g,'{history}',g->'history'||jsonb_build_array(jsonb_build_object('day',d,'tasks',g->'tasks')));
   if d=20 then
     g:=jsonb_set(g,'{day}',to_jsonb(21));g:=jsonb_set(g,'{gate}','"duration"');
   elsif d=30 then
     if (g->>'phaseLength')::int=20 then
       g:=jsonb_set(g,'{day}',to_jsonb(31));g:=jsonb_set(g,'{gate}','"wip"');
     else g:=jsonb_set(g,'{gate}','"done"');end if;
   elsif d=40 then g:=jsonb_set(g,'{gate}','"done"');
   else
     g:=jsonb_set(g,'{day}',to_jsonb(d+1));
     g:=jsonb_set(g,'{gate}',to_jsonb(case when d+1>=11 then 'dsu' else 'playing' end));
   end if;
   g:=jsonb_set(g,'{turn}',to_jsonb(1));
   g:=jsonb_set(g,'{step}','"block"');
   g:=jsonb_set(g,'{events}','[]'::jsonb);
 elsif kind='move' then
   if g->>'gate'<>'playing' or who<>turn_no then raise exception 'Not your turn'; end if;
   allowed:=public.mp_legal(g,who);
   if val='pass' then
     if jsonb_array_length(allowed)>0 then raise exception 'A legal move is available'; end if;
   else
     if val not in ('pull','advance','unblock','block','helpAdvance','helpUnblock') or task_id is null then raise exception 'Invalid action'; end if;
     if not (allowed @> jsonb_build_array(jsonb_build_object('type',val,'id',task_id))) then raise exception 'That task is not eligible for this move'; end if;
     for task in select value from jsonb_array_elements(g->'tasks') loop
       if (task->>'id')::int=task_id then
         if val='pull' then task:=jsonb_set(jsonb_set(jsonb_set(task,'{status}','1'::jsonb),'{owner}',to_jsonb(who)),'{started}',to_jsonb(d));
         elsif val in ('advance','helpAdvance') then
           s:=(task->>'status')::int+1;
           task:=jsonb_set(task,'{status}',to_jsonb(s));
           if s=3 then task:=jsonb_set(task,'{finished}',to_jsonb(d)); end if;
         elsif val='block' then task:=jsonb_set(task,'{blocked}','true'::jsonb);
         elsif val in ('unblock','helpUnblock') then task:=jsonb_set(task,'{blocked}','false'::jsonb);
         end if;
       end if;
       updated_tasks:=updated_tasks||jsonb_build_array(task);
     end loop;
     g:=jsonb_set(g,'{tasks}',updated_tasks);
   end if;
   display_text:='Player '||who||' · '||coalesce(val,'')||case when task_id is not null then ' · Task #'||task_id else '' end;
   g:=jsonb_set(g,'{events}',g->'events'||to_jsonb(display_text));
   red:=(g->'cards'->(((d-1)%10)*n+who-1)->>'red')::boolean;
   if not red and val='block' then
      g:=jsonb_set(g,'{step}','"pull"');
   else
      g:=jsonb_set(g,'{turn}',to_jsonb(turn_no+1));
      g:=jsonb_set(g,'{step}','"block"');
   end if;
 else raise exception 'Unknown operation'; end if;
 update public.kanban_mp_rooms set game=g,updated_at=now(),expires_at=now()+interval '4 hours' where code=r.code returning * into r;
 return public.mp_public(r);
end;
$$;

-- Allow browser clients to use only the room functions, not the underlying table.
revoke all on function public.mp_blank_tasks() from public;
revoke all on function public.mp_legal(jsonb,integer) from public;
revoke all on function public.mp_public(public.kanban_mp_rooms) from public;
grant execute on function public.mp_create(text,text,integer), public.mp_join(text,text,text), public.mp_get(text), public.mp_command(text,uuid,text,integer,text) to anon,authenticated;

-- Optional automated expiry cleanup (enable pg_cron in Supabase first):
-- select cron.schedule('kanban-mp-expire','*/15 * * * *',
--   $$ delete from public.kanban_mp_rooms where expires_at < now(); $$);
