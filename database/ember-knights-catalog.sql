-- Add character purchases without changing existing items or player saves.
begin;
insert into private.shop_items (id,display_name,item_type,cost,min_level,description,enabled)
values
 ('ember_blue','Blue Ember Knight','character',300,1,'A blue flame warrior with a shining sword. Replaces your chicken.',true),
 ('ember_orange','Orange Ember Knight','character',300,1,'A blazing orange warrior ready for the next order. Replaces your chicken.',true),
 ('ember_green','Green Ember Knight','character',300,1,'A bright green flame warrior. Replaces your chicken.',true),
 ('ember_purple','Purple Ember Knight','character',300,1,'A purple flame warrior with glowing eyes. Replaces your chicken.',true)
on conflict (id) do update set
 display_name=excluded.display_name,item_type=excluded.item_type,cost=excluded.cost,
 min_level=excluded.min_level,description=excluded.description,enabled=excluded.enabled;
commit;
