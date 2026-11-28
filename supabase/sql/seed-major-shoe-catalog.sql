-- Additional curated running-shoe choices, verified on 2026-11-28.
-- These are selection candidates, not recommendations or lifespan estimates.
-- Source names omit gender, colorway, width and trademark-symbol variants.
-- NIKE:
--   https://www.nike.com/de/w/strasse-running-schuhe-37v7jz8kwewzy7ok/
--   https://www.nike.com/it/w/1qjudz37v7jzb3e0kzj5jw
-- adidas:
--   https://www.adidas.com/us/regular_fit-new_to_sale-adizero-road
-- ASICS:
--   https://assets.asics.com/system/media_libraries/25239/file.pdf
-- New Balance:
--   https://www.newbalance.com/pd/fuelcell-rebel-v5/MFCXLC5-D-045.html
--   https://www.newbalance.com/pd/fresh-foam-x-1080v14/M1080V14-47512-PMG-NA-PR.html
--   https://www.newbalance.com/pd/fresh-foam-x-880v15/M880K15-D-115.html
-- PUMA:
--   https://us.puma.com/us/en/pd/deviate-nitro-3-mens-road-running-shoes/309707
--   https://us.puma.com/us/en/pd/fast-r-nitro-elite-3-mens-road-running-shoes/312060
-- BROOKS:
--   https://www.brooksrunning.com/en_gb/brooks-running-shoes/?sz=96
-- HOKA:
--   https://au.hoka.com/categories/mens/shoes/road-running
-- Saucony:
--   https://www.saucony.com/UK/en_GB/saucony-black-friday/?prefn1=genericSizeType&prefn2=productCategory&prefn3=size&prefv1=M%7CW&prefv2=Running&prefv3=7%7C6.5%7C8.5
-- MIZUNO:
--   https://twn.mizuno.com/products/j1gc253406
-- On:
--   https://www.on.com/en-nl/shop/classics/mens/shoes
--   https://www.on.com/en-us/shop/shoes/running/plush
-- ALTRA:
--   https://www.altrarunning.com/en-us/collections/women?page=2&srule=top-rated
-- Salomon:
--   https://sg.salomon.com/collections/road-running-1

begin;
insert into public.shoe_models as existing
  (canonical_name, normalized_name, manufacturer, model_name, is_catalog_entry)
values
  ('NIKE Alphafly 3', 'nikealphafly3', 'NIKE', 'Alphafly 3', true),
  ('NIKE Vaporfly 4', 'nikevaporfly4', 'NIKE', 'Vaporfly 4', true),
  ('NIKE Vomero 18', 'nikevomero18', 'NIKE', 'Vomero 18', true),
  ('NIKE Zoom Fly 6', 'nikezoomfly6', 'NIKE', 'Zoom Fly 6', true),
  ('NIKE Pegasus Premium', 'nikepegasuspremium', 'NIKE', 'Pegasus Premium', true),
  ('adidas ADIZERO BOSTON 13', 'adidasadizeroboston13', 'adidas', 'ADIZERO BOSTON 13', true),
  ('adidas ADIZERO SL 2', 'adidasadizerosl2', 'adidas', 'ADIZERO SL 2', true),
  ('adidas ADIZERO ADIOS 9', 'adidasadizeroadios9', 'adidas', 'ADIZERO ADIOS 9', true),
  ('ASICS METASPEED SKY TOKYO', 'asicsmetaspeedskytokyo', 'ASICS', 'METASPEED SKY TOKYO', true),
  ('ASICS METASPEED EDGE TOKYO', 'asicsmetaspeededgetokyo', 'ASICS', 'METASPEED EDGE TOKYO', true),
  ('ASICS SUPERBLAST 2', 'asicssuperblast2', 'ASICS', 'SUPERBLAST 2', true),
  ('ASICS GEL-KAYANO 32', 'asicsgelkayano32', 'ASICS', 'GEL-KAYANO 32', true),
  ('ASICS MAGIC SPEED 5', 'asicsmagicspeed5', 'ASICS', 'MAGIC SPEED 5', true),
  ('ASICS GEL-CUMULUS 27', 'asicsgelcumulus27', 'ASICS', 'GEL-CUMULUS 27', true),
  ('ASICS METASPEED RAY', 'asicsmetaspeedray', 'ASICS', 'METASPEED RAY', true),
  ('New Balance FuelCell Rebel v5', 'newbalancefuelcellrebelv5', 'New Balance', 'FuelCell Rebel v5', true),
  ('New Balance Fresh Foam X 1080v14', 'newbalancefreshfoamx1080v14', 'New Balance', 'Fresh Foam X 1080v14', true),
  ('New Balance Fresh Foam X 880v15', 'newbalancefreshfoamx880v15', 'New Balance', 'Fresh Foam X 880v15', true),
  ('PUMA Deviate NITRO 3', 'pumadeviatenitro3', 'PUMA', 'Deviate NITRO 3', true),
  ('PUMA Velocity NITRO 4', 'pumavelocitynitro4', 'PUMA', 'Velocity NITRO 4', true),
  ('PUMA Magnify NITRO 3', 'pumamagnifynitro3', 'PUMA', 'Magnify NITRO 3', true),
  ('PUMA FAST-R NITRO Elite 3', 'pumafastrnitroelite3', 'PUMA', 'FAST-R NITRO Elite 3', true),
  ('BROOKS Ghost 17', 'brooksghost17', 'BROOKS', 'Ghost 17', true),
  ('BROOKS Glycerin 22', 'brooksglycerin22', 'BROOKS', 'Glycerin 22', true),
  ('BROOKS Hyperion Max 3', 'brookshyperionmax3', 'BROOKS', 'Hyperion Max 3', true),
  ('HOKA Clifton 10', 'hokaclifton10', 'HOKA', 'Clifton 10', true),
  ('HOKA Bondi 9', 'hokabondi9', 'HOKA', 'Bondi 9', true),
  ('HOKA Mach 7', 'hokamach7', 'HOKA', 'Mach 7', true),
  ('HOKA Rocket X 3', 'hokarocketx3', 'HOKA', 'Rocket X 3', true),
  ('HOKA Mach X 3', 'hokamachx3', 'HOKA', 'Mach X 3', true),
  ('Saucony Ride 18', 'sauconyride18', 'Saucony', 'Ride 18', true),
  ('Saucony Triumph 23', 'sauconytriumph23', 'Saucony', 'Triumph 23', true),
  ('Saucony Endorphin Speed 5', 'sauconyendorphinspeed5', 'Saucony', 'Endorphin Speed 5', true),
  ('Saucony Endorphin Pro 4', 'sauconyendorphinpro4', 'Saucony', 'Endorphin Pro 4', true),
  ('MIZUNO WAVE RIDER 29', 'mizunowaverider29', 'MIZUNO', 'WAVE RIDER 29', true),
  ('MIZUNO NEO VISTA 2', 'mizunoneovista2', 'MIZUNO', 'NEO VISTA 2', true),
  ('MIZUNO NEO ZEN', 'mizunoneozen', 'MIZUNO', 'NEO ZEN', true),
  ('MIZUNO WAVE REBELLION PRO 3', 'mizunowaverebellionpro3', 'MIZUNO', 'WAVE REBELLION PRO 3', true),
  ('On Cloudmonster 2', 'oncloudmonster2', 'On', 'Cloudmonster 2', true),
  ('On Cloudsurfer 2', 'oncloudsurfer2', 'On', 'Cloudsurfer 2', true),
  ('On Cloudboom Strike', 'oncloudboomstrike', 'On', 'Cloudboom Strike', true),
  ('On Cloudrunner 3', 'oncloudrunner3', 'On', 'Cloudrunner 3', true),
  ('ALTRA Torin 8', 'altratorin8', 'ALTRA', 'Torin 8', true),
  ('ALTRA Escalante 4', 'altraescalante4', 'ALTRA', 'Escalante 4', true),
  ('ALTRA Experience Flow 2', 'altraexperienceflow2', 'ALTRA', 'Experience Flow 2', true),
  ('Salomon AERO GLIDE 3', 'salomonaeroglide3', 'Salomon', 'AERO GLIDE 3', true),
  ('Salomon AERO BLAZE 3', 'salomonaeroblaze3', 'Salomon', 'AERO BLAZE 3', true),
  ('Salomon S/LAB PHANTASM 2', 'salomonslabphantasm2', 'Salomon', 'S/LAB PHANTASM 2', true)
on conflict (normalized_name) do update set
  manufacturer = coalesce(existing.manufacturer, excluded.manufacturer),
  model_name = coalesce(existing.model_name, excluded.model_name),
  is_catalog_entry = true;
commit;

