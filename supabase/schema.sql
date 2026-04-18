create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'New woodworking build',
  source_url text not null default '',
  status text not null default 'Idea',
  estimated_hours numeric not null default 0,
  actual_hours numeric not null default 0,
  hourly_rate numeric not null default 35,
  markup_percent numeric not null default 25,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  name text not null default '',
  category text not null default '',
  qty numeric not null default 1,
  unit text not null default '',
  unit_cost numeric not null default 0,
  source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade
);

create table if not exists public.cuts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  part text not null default '',
  material text not null default '',
  qty numeric not null default 1,
  length text not null default '',
  width text not null default '',
  thickness text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_projects_updated_at on public.projects;
create trigger touch_projects_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

drop trigger if exists touch_materials_updated_at on public.materials;
create trigger touch_materials_updated_at
before update on public.materials
for each row execute function public.touch_updated_at();

drop trigger if exists touch_cuts_updated_at on public.cuts;
create trigger touch_cuts_updated_at
before update on public.cuts
for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;
alter table public.materials enable row level security;
alter table public.cuts enable row level security;

drop policy if exists "Users can read their projects" on public.projects;
create policy "Users can read their projects"
on public.projects for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their projects" on public.projects;
create policy "Users can insert their projects"
on public.projects for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their projects" on public.projects;
create policy "Users can update their projects"
on public.projects for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their projects" on public.projects;
create policy "Users can delete their projects"
on public.projects for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their materials" on public.materials;
create policy "Users can read their materials"
on public.materials for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their materials" on public.materials;
create policy "Users can insert their materials"
on public.materials for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their materials" on public.materials;
create policy "Users can update their materials"
on public.materials for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their materials" on public.materials;
create policy "Users can delete their materials"
on public.materials for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their cuts" on public.cuts;
create policy "Users can read their cuts"
on public.cuts for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their cuts" on public.cuts;
create policy "Users can insert their cuts"
on public.cuts for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their cuts" on public.cuts;
create policy "Users can update their cuts"
on public.cuts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their cuts" on public.cuts;
create policy "Users can delete their cuts"
on public.cuts for delete
to authenticated
using ((select auth.uid()) = user_id);
