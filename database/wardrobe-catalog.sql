-- Idempotent catalog update; existing ownership and player progress are retained.
begin;
insert into private.shop_items (id,display_name,item_type,cost,min_level,description,enabled)
values
 ('bright_green','Bright Green','color',100,1,'Bright green feathers. Keeps your costume on.',true),
 ('pink','Pink','color',100,1,'Bubblegum pink feathers. Keeps your costume on.',true),
 ('blue','Blue','color',100,1,'Sky blue feathers. Keeps your costume on.',true),
 ('dress','Party Dress','costume',200,1,'A purple party dress with a gold sash and matching bow.',true),
 ('cowboy','Cowboy','costume',200,1,'A wide-brimmed hat, suede vest, bandana and sheriff star.',true),
 ('firefighter','Firefighter','costume',200,1,'A red helmet and coat with bright safety stripes.',true)
on conflict (id) do update set
 display_name=excluded.display_name,item_type=excluded.item_type,cost=excluded.cost,
 min_level=excluded.min_level,description=excluded.description,enabled=excluded.enabled;
update private.shop_items set item_type='costume',cost=200,
 display_name='Pumpkin Costume' where id='halloween_chicken';
commit;
