ALTER TABLE properties
  ADD COLUMN preferred_gender VARCHAR(20) NOT NULL DEFAULT 'ANY' AFTER occupancy_type,
  ADD INDEX idx_properties_preferred_gender (preferred_gender);
