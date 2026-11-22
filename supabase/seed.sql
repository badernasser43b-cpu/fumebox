-- MOODBOX demonstration catalogue. Runs only on an empty database (re-run safe).
-- Prices are realistic sample retail prices in AED for a demonstration store.

insert into public.collections (slug, name, tagline, description, theme_color, image_url, discount_pct, sort_order)
select * from (values
  ('focus',  'Focus',  'Study smarter, stress less',
   'A curated set of study and productivity essentials for exam season, deadlines and deep-work days.',
   '#3D5AFE', 'images/boxes/focus.svg', 10.00, 1),
  ('relax',  'Relax',  'A pause button in a box',
   'Self-care and comfort pieces for slow evenings, better sleep and a well-deserved reset.',
   '#A0618F', 'images/boxes/relax.svg', 10.00, 2),
  ('gaming', 'Gaming', 'Level up your setup',
   'Desk and comfort upgrades for gamers who care about a clean, comfortable and good-looking setup.',
   '#10A374', 'images/boxes/gaming.svg', 10.00, 3),
  ('travel', 'Travel', 'Pack light, travel easy',
   'Smart travel essentials for weekend trips, long-haul flights and everything in between.',
   '#E8A33D', 'images/boxes/travel.svg', 10.00, 4)
) v(slug, name, tagline, description, theme_color, image_url, discount_pct, sort_order)
where not exists (select 1 from public.collections);

insert into public.products (name, description, price_aed, category, collection_id, stock, image_url, is_featured, sort_order)
select v.name, v.description, v.price, v.category, c.id, v.stock, v.img, v.featured, v.sort
from (values
  -- Focus
  ('focus','Linen A5 Dotted Journal','160-page lay-flat dotted journal with a linen hard cover and ribbon marker.',45.00,'Stationery',40,'images/items/journal.svg',true,1),
  ('focus','Matte Gel Pen Trio','Three 0.5 mm quick-dry gel pens in black, navy and graphite.',28.00,'Stationery',60,'images/items/pens.svg',false,2),
  ('focus','Pomodoro Desk Timer','Silent rotating 5/25/45-minute focus timer with soft alarm.',69.00,'Productivity',22,'images/items/timer.svg',true,3),
  ('focus','Pastel Highlighter Set (6)','Six chisel-tip pastel highlighters that do not bleed through paper.',22.00,'Stationery',55,'images/items/highlighters.svg',false,4),
  ('focus','Focus Herbal Tea (20 bags)','Peppermint and rosemary caffeine-free blend for long study sessions.',32.00,'Wellbeing',35,'images/items/tea.svg',false,5),
  ('focus','Bamboo Phone Stand','Adjustable bamboo stand that keeps your phone upright and out of reach while you work.',35.00,'Productivity',30,'images/items/phone-stand.svg',false,6),
  -- Relax
  ('relax','Lavender Soy Candle 200 g','Hand-poured soy wax candle with lavender and vanilla, about 40 hours burn time.',65.00,'Home',28,'images/items/candle.svg',true,1),
  ('relax','Mulberry Silk Sleep Mask','Soft, breathable 100% mulberry silk mask with adjustable strap.',49.00,'Self-care',25,'images/items/sleep-mask.svg',false,2),
  ('relax','Himalayan Bath Salt Soak 300 g','Pink Himalayan salt with eucalyptus oil for a calming soak.',42.00,'Self-care',30,'images/items/bath-salt.svg',false,3),
  ('relax','Chamomile Night Tea Tin','Loose-leaf chamomile and lemon balm tea, about 25 cups.',38.00,'Wellbeing',30,'images/items/tea-tin.svg',false,4),
  ('relax','Cloud Fleece Socks','Ultra-soft fleece lounge socks with non-slip soles. One size.',29.00,'Comfort',50,'images/items/socks.svg',false,5),
  ('relax','Ceramic Aroma Diffuser','Ultrasonic ceramic diffuser with warm light and auto shut-off.',119.00,'Home',3,'images/items/diffuser.svg',false,6),
  -- Gaming
  ('gaming','XL RGB Desk Mat','90 × 40 cm stitched-edge desk mat with USB-powered RGB border.',89.00,'Desk setup',20,'images/items/desk-mat.svg',true,1),
  ('gaming','Aluminium Headset Stand','Weighted aluminium stand with cable hook and non-slip base.',59.00,'Desk setup',18,'images/items/headset-stand.svg',false,2),
  ('gaming','Cable Management Kit','Velcro ties, adhesive clips and a cable sleeve for a clean desk.',35.00,'Desk setup',40,'images/items/cables.svg',false,3),
  ('gaming','Keyboard Cleaning Kit','Keycap puller, soft brush and cleaning gel for mechanical keyboards.',25.00,'Maintenance',45,'images/items/keycap-kit.svg',false,4),
  ('gaming','Monitor LED Light Bar','Glare-free USB-C screen light bar with adjustable warmth.',79.00,'Lighting',12,'images/items/light-bar.svg',false,5),
  ('gaming','Anti-Sweat Gaming Gloves','Breathable fingerless gloves for better grip in long sessions.',39.00,'Comfort',0,'images/items/gloves.svg',false,6),
  -- Travel
  ('travel','Packing Cubes Set (4)','Four lightweight compression cubes in different sizes.',89.00,'Organisation',24,'images/items/packing-cubes.svg',true,1),
  ('travel','Memory-Foam Neck Pillow','Ergonomic neck pillow with washable cover and travel pouch.',69.00,'Comfort',20,'images/items/neck-pillow.svg',false,2),
  ('travel','Universal Travel Adapter','All-in-one adapter for 150+ countries with 2 USB-A and 1 USB-C port.',79.00,'Electronics',26,'images/items/adapter.svg',false,3),
  ('travel','Leak-Proof Toiletry Bottles (4)','Four 90 ml silicone squeeze bottles, airport-security friendly.',35.00,'Organisation',40,'images/items/bottles.svg',false,4),
  ('travel','Passport & Card Wallet','Slim RFID-blocking wallet for passport, cards, boarding pass and SIM.',55.00,'Accessories',30,'images/items/passport-wallet.svg',false,5),
  ('travel','Compact Power Bank 10,000 mAh','Pocket-size USB-C power bank, flight-approved capacity.',89.00,'Electronics',15,'images/items/powerbank.svg',false,6)
) v(slug, name, description, price, category, stock, img, featured, sort)
join public.collections c on c.slug = v.slug
where not exists (select 1 from public.products);

-- Signature box contents (one of each listed item)
insert into public.collection_items (collection_id, product_id, quantity)
select c.id, p.id, 1
from (values
  ('focus',  'Linen A5 Dotted Journal'), ('focus', 'Matte Gel Pen Trio'), ('focus', 'Pomodoro Desk Timer'),
  ('focus',  'Pastel Highlighter Set (6)'), ('focus', 'Focus Herbal Tea (20 bags)'),
  ('relax',  'Lavender Soy Candle 200 g'), ('relax', 'Mulberry Silk Sleep Mask'), ('relax', 'Himalayan Bath Salt Soak 300 g'),
  ('relax',  'Chamomile Night Tea Tin'), ('relax', 'Cloud Fleece Socks'),
  ('gaming', 'XL RGB Desk Mat'), ('gaming', 'Aluminium Headset Stand'), ('gaming', 'Cable Management Kit'),
  ('gaming', 'Keyboard Cleaning Kit'),
  ('travel', 'Packing Cubes Set (4)'), ('travel', 'Memory-Foam Neck Pillow'), ('travel', 'Universal Travel Adapter'),
  ('travel', 'Leak-Proof Toiletry Bottles (4)')
) v(slug, item)
join public.collections c on c.slug = v.slug
join public.products p on p.name = v.item
where not exists (select 1 from public.collection_items);

-- Editable business content. Every value is a PLACEHOLDER until the group
-- replaces it in Admin → Site content.
update public.site_settings set content = jsonb_build_object(
  'store_name', 'MOODBOX',
  'tagline', 'Gift boxes for every mood',
  'about', 'MOODBOX is a demonstration online store created for the BIS 2103 Business Information Systems course at Higher Colleges of Technology. We sell themed gift and lifestyle boxes — Focus, Relax, Gaming and Travel — and let customers build their own box from individual items.',
  'mission', 'To make thoughtful gifting effortless by curating useful, good-quality items into boxes that match how people feel and what they need.',
  'vision', 'To be the UAE''s go-to online destination for personalised, mood-based gift boxes for students and young professionals.',
  'strategy', 'Differentiation through personalisation: curated signature boxes at a 10% bundle saving, plus a Build-Your-Own option. Mobile-first shopping, free delivery over AED 200, weekly analytics-driven improvements, and ERP-based purchasing and stock control to avoid stock-outs.',
  'target_customers', 'College students and young professionals in the UAE aged 18–30 who buy gifts for friends and family or treat themselves, shop mostly on their phones, and value personalisation, fair prices and fast delivery.',
  'management', 'MOODBOX is run by a small founding team. Each member owns one business function — operations and inventory, marketing and analytics, website and customer experience, finance and ERP, and customer service — and the team meets weekly to review analytics and agree improvements.',
  'team', jsonb_build_array(
    jsonb_build_object('name', '[Group member 1]', 'role', 'Operations & Inventory Manager'),
    jsonb_build_object('name', '[Group member 2]', 'role', 'Marketing & Analytics Manager'),
    jsonb_build_object('name', '[Group member 3]', 'role', 'Website & Customer Experience Lead'),
    jsonb_build_object('name', '[Group member 4]', 'role', 'Finance & ERP Lead'),
    jsonb_build_object('name', '[Group member 5]', 'role', 'Customer Service Lead')
  ),
  'email', 'hello@moodbox.example',
  'phone', '+971 00 000 0000',
  'address', 'Demonstration location — Abu Dhabi, United Arab Emirates',
  'map_query', 'Abu Dhabi, United Arab Emirates',
  'hours', 'Sun–Thu 9:00–18:00 · Fri 9:00–12:00 · Sat closed'
)
where id = 1 and content = '{}'::jsonb;
