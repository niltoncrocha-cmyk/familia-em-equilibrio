-- Passa as categorias padrão do sistema para a única família, para poderem ser renomeadas ou excluídas.
update public.categories
set family_id = (select id from public.families limit 1), is_system = false
where family_id is null and (select count(*) from public.families) = 1;
