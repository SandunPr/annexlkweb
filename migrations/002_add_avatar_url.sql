-- Add avatar_url column to user_profiles table to store Google login or custom avatars
ALTER TABLE user_profiles ADD COLUMN avatar_url VARCHAR(1000) NULL AFTER address;
