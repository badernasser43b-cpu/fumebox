-- FUMEBOX catalogue: women's and men's perfumes from the world's great fragrance houses.
-- Runs only on an empty database (re-run safe). Prices are indicative UAE retail prices in AED.
-- Brand names and trademarks belong to their owners; FUMEBOX is not affiliated with them.

insert into public.collections (slug, name, tagline, description, theme_color, image_url, discount_pct, sort_order)
select * from (values
  ('women', 'Women''s', 'Three icons for her',
   'Chanel N°5, Miss Dior and YSL Libre: three of the world''s most-loved women''s fragrances, gift-wrapped together with a message card.',
   '#B04A72', 'images/perfume/boxes/women.webp', 10.00, 1),
  ('men',   'Men''s',   'Three icons for him',
   'Bleu de Chanel, Dior Sauvage and Versace Eros: three best-selling men''s fragrances, gift-wrapped together with a message card.',
   '#1F3A5F', 'images/perfume/boxes/men.webp', 10.00, 2)
) v(slug, name, tagline, description, theme_color, image_url, discount_pct, sort_order)
where not exists (select 1 from public.collections);

insert into public.products (name, description, price_aed, category, collection_id, stock, image_url, is_featured, sort_order)
select v.name, v.description, v.price, v.category, c.id, v.stock, v.img, v.featured, v.sort
from (values
  -- Women's
  ('women','Chanel N°5 Eau de Parfum 100 ml','The timeless aldehydic floral from Paris: May rose and jasmine wrapped in soft vanilla and sandalwood.',640.00,'Floral',18,'images/perfume/items/chanel-no5.webp',true,1),
  ('women','Chanel Coco Mademoiselle Eau de Parfum 100 ml','A fresh, sensual oriental: bright orange and rose over patchouli and white musk.',620.00,'Chypre',20,'images/perfume/items/coco-mademoiselle.webp',true,2),
  ('women','Chanel Coco Noir Eau de Parfum 100 ml','Grapefruit and rose over patchouli, sandalwood and vanilla. Deep and elegant for evenings.',640.00,'Oriental',9,'images/perfume/items/coco-noir.webp',false,3),
  ('women','Dior Miss Dior Eau de Parfum 100 ml','A romantic floral bouquet of rose and lily of the valley with a soft musky trail.',575.00,'Floral',16,'images/perfume/items/miss-dior.webp',true,4),
  ('women','Dior Poison Girl Eau de Toilette 100 ml','Bitter orange and rose over almond, tonka bean and vanilla. Playful and addictive.',460.00,'Gourmand',7,'images/perfume/items/poison-girl.webp',false,5),
  ('women','Yves Saint Laurent Libre Eau de Parfum 90 ml','Lavender and orange blossom with a warm vanilla and musk base. Bold and free.',560.00,'Floral',14,'images/perfume/items/ysl-libre.webp',true,6),
  ('women','Yves Saint Laurent Mon Paris Eau de Parfum 90 ml','Strawberry, raspberry and pear over white musk and patchouli. Sweet and radiant.',525.00,'Fruity',11,'images/perfume/items/ysl-mon-paris.webp',false,7),
  ('women','Versace Crystal Noir Eau de Toilette 90 ml','Ginger, gardenia and coconut over amber and musk. Mysterious and warm.',340.00,'Oriental',4,'images/perfume/items/crystal-noir.webp',false,8),
  -- Men's
  ('men','Bleu de Chanel Eau de Parfum 100 ml','A modern woody aromatic: fresh citrus, incense and cedar. Polished from day to night.',625.00,'Woody',15,'images/perfume/items/bleu-de-chanel.webp',true,1),
  ('men','Dior Sauvage Eau de Toilette 100 ml','Calabrian bergamot and pepper over ambroxan. Fresh, raw and noble.',495.00,'Fresh spicy',22,'images/perfume/items/dior-sauvage.webp',true,2),
  ('men','Dior Homme Sport Eau de Toilette 125 ml','Sparkling citrus and ginger over elemi and woody notes. Energetic and clean.',455.00,'Citrus',10,'images/perfume/items/dior-homme-sport.webp',false,3),
  ('men','Yves Saint Laurent Y Eau de Parfum 100 ml','Fresh apple and ginger over sage, amberwood and tonka bean. Confident and modern.',520.00,'Aromatic',12,'images/perfume/items/ysl-y.webp',true,4),
  ('men','Versace Eros Eau de Toilette 100 ml','Mint, green apple and lemon over tonka bean and vanilla. Bold and seductive.',360.00,'Aromatic',19,'images/perfume/items/versace-eros.webp',false,5),
  ('men','Versace Dylan Blue Pour Homme Eau de Toilette 100 ml','Bergamot and grapefruit with aquatic notes, incense and musk. Masculine and fresh.',345.00,'Fresh',2,'images/perfume/items/versace-dylan-blue.webp',false,6)
) v(slug, name, description, price, category, stock, img, featured, sort)
join public.collections c on c.slug = v.slug
where not exists (select 1 from public.products);

-- Gift set contents (one of each listed perfume)
insert into public.collection_items (collection_id, product_id, quantity)
select c.id, p.id, 1
from (values
  ('women', 'Chanel N°5 Eau de Parfum 100 ml'), ('women', 'Dior Miss Dior Eau de Parfum 100 ml'), ('women', 'Yves Saint Laurent Libre Eau de Parfum 90 ml'),
  ('men',   'Bleu de Chanel Eau de Parfum 100 ml'), ('men', 'Dior Sauvage Eau de Toilette 100 ml'), ('men', 'Versace Eros Eau de Toilette 100 ml')
) v(slug, item)
join public.collections c on c.slug = v.slug
join public.products p on p.name = v.item
where not exists (select 1 from public.collection_items);


-- Editable business content. Every value is a PLACEHOLDER until the group
-- replaces it in Admin → Site content.
update public.site_settings set content = jsonb_build_object(
  'store_name', 'FUMEBOX',
  'tagline', 'Perfumes for her and him',
  'about', 'FUMEBOX brings the world''s most-loved fragrances together in one place. We sell authentic women''s and men''s perfumes from the great perfume houses of Paris, Milan and beyond, ready-made gift sets, and build-your-own perfume gift boxes delivered across the UAE.',
  'mission', 'To make finding and gifting a great fragrance simple: a curated collection of iconic perfumes, honest prices and gift-ready packaging, all in one place.',
  'vision', 'To be the UAE''s favourite online destination for discovering and gifting the world''s iconic perfumes.',
  'strategy', 'Curated selection over endless choice: a focused collection of best-selling women''s and men''s fragrances, signature gift sets at a 10% saving, and a build-your-own gift box. Mobile-first shopping, free delivery over AED 200, weekly analytics-driven improvements, and ERP-based purchasing and stock control to avoid stock-outs.',
  'target_customers', 'Fragrance lovers and gift buyers in the UAE aged 18 to 35 who shop mostly on their phones, buy perfume for themselves or as gifts for birthdays and occasions, and value authentic brands, fair prices and fast delivery.',
  'management', 'FUMEBOX is run by a small founding team. Each member owns one business function: buying and inventory, marketing and analytics, website and customer experience, finance and ERP, and customer service. The team meets weekly to review analytics and agree improvements.',
  'team', jsonb_build_array(
    jsonb_build_object('name', '[Group member 1]', 'role', 'Buying & Inventory Manager'),
    jsonb_build_object('name', '[Group member 2]', 'role', 'Marketing & Analytics Manager'),
    jsonb_build_object('name', '[Group member 3]', 'role', 'Website & Customer Experience Lead'),
    jsonb_build_object('name', '[Group member 4]', 'role', 'Finance & ERP Lead'),
    jsonb_build_object('name', '[Group member 5]', 'role', 'Customer Service Lead')
  ),
  'email', 'hello@fumebox.example',
  'phone', '+971 00 000 0000',
  'address', 'Abu Dhabi, United Arab Emirates',
  'map_query', 'Abu Dhabi, United Arab Emirates',
  'hours', 'Sun–Thu 9:00–18:00 · Fri 9:00–12:00 · Sat closed'
)
where id = 1 and content = '{}'::jsonb;
