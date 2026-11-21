ALTER TABLE page_banners DROP CONSTRAINT page_banners_slot_check;
ALTER TABLE page_banners ADD CONSTRAINT page_banners_slot_check
  CHECK (slot IN ('home_hero','home_side_top','home_side_bottom','home_wide','category_hero',
                  'article_featured','article_left','article_right','article_inline',
                  'sidebar_mid','list_top','list_left','list_right'));
