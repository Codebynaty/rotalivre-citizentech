-- Estrutura de banco de dados e políticas de acesso (RLS) do RotaLivre

-- 1. Perfis de usuários vinculados ao Supabase Auth 
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  tipo_mobilidade text check (tipo_mobilidade in ('cego', 'cadeirante', 'reduzida', 'voluntario')) default 'cego',
  papel text check (papel in ('cidadao', 'voluntario', 'moderador')) default 'cidadao',
  criado_em timestamptz default now()
);

alter table public.perfis enable row level security;

create policy "Usuarios veem proprio perfil"
  on public.perfis for select
  using (auth.uid() = id);

create policy "Usuarios atualizam proprio perfil"
  on public.perfis for update
  using (auth.uid() = id);

-- 2. Relatos de barreiras urbanas e denúncias 
create table if not exists public.relatos (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid references auth.users(id) on delete set null,
  tipo text not null,
  titulo text not null,
  descricao text,
  lat double precision not null,
  lon double precision not null,
  foto_url text,
  protocolo_156 text,
  status text check (status in ('pendente', 'aprovado', 'rejeitado')) default 'pendente',
  total_denuncias int default 0,
  criado_em timestamptz default now()
);

alter table public.relatos enable row level security;

create policy "Qualquer usuario le relatos aprovados ou proprios"
  on public.relatos for select
  using (status = 'aprovado' or auth.uid() = autor_id);

create policy "Usuarios autenticados criam relatos"
  on public.relatos for insert
  with check (auth.uid() = autor_id);

create policy "Moderadores aprovam ou removem relatos"
  on public.relatos for update
  using (
    exists (
      select 1 from public.perfis p
      where p.id = auth.uid() and p.papel = 'moderador'
    )
  );

-- Tabela de denúncias contra relatos inválidos/falsos
create table if not exists public.denuncias_relatos (
  id uuid primary key default gen_random_uuid(),
  relato_id uuid references public.relatos(id) on delete cascade,
  denunciante_id uuid references auth.users(id) on delete cascade,
  motivo text not null,
  criado_em timestamptz default now(),
  unique (relato_id, denunciante_id)
);

alter table public.denuncias_relatos enable row level security;

create policy "Usuarios autenticados registram denuncia unica"
  on public.denuncias_relatos for insert
  with check (auth.uid() = denunciante_id);

-- 3. Voluntários e Pedidos de Apoio com aprovação manual
create table if not exists public.voluntarios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  cpf_hash text not null,
  regiao text not null,
  turno text check (turno in ('manha', 'tarde', 'noite')) default 'manha',
  lat double precision not null,
  lon double precision not null,
  status_aprovacao text check (status_aprovacao in ('pendente', 'aprovado', 'recusado')) default 'pendente',
  disponivel boolean default true,
  nota_media numeric(2,1) default 5.0,
  criado_em timestamptz default now()
);

alter table public.voluntarios enable row level security;

create policy "Todos veem voluntarios aprovados"
  on public.voluntarios for select
  using (status_aprovacao = 'aprovado' or auth.uid() = usuario_id);

create policy "Usuario solicita cadastro de voluntario"
  on public.voluntarios for insert
  with check (auth.uid() = usuario_id and status_aprovacao = 'pendente');

create policy "Apenas moderador aprova voluntario manualmente"
  on public.voluntarios for update
  using (
    exists (
      select 1 from public.perfis p
      where p.id = auth.uid() and p.papel = 'moderador'
    )
  );

create table if not exists public.pedidos_apoio (
  id uuid primary key default gen_random_uuid(),
  cidadao_id uuid references auth.users(id) on delete cascade,
  voluntario_id uuid references public.voluntarios(id) on delete set null,
  ponto_encontro text not null,
  lat double precision not null,
  lon double precision not null,
  distancia_metros int,
  senha_voz text not null,
  status text check (status in ('aguardando_aprovacao', 'pareado', 'concluido', 'cancelado')) default 'aguardando_aprovacao',
  criado_em timestamptz default now()
);

alter table public.pedidos_apoio enable row level security;

create policy "Cidadao e voluntario veem seus pedidos"
  on public.pedidos_apoio for select
  using (
    auth.uid() = cidadao_id or
    exists (select 1 from public.voluntarios v where v.id = voluntario_id and v.usuario_id = auth.uid())
  );

create policy "Cidadao cria pedido de apoio"
  on public.pedidos_apoio for insert
  with check (auth.uid() = cidadao_id);