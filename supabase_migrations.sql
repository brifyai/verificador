-- Add timestamp columns to verifications table
alter table verifications add column timestamp_start text;
alter table verifications add column timestamp_end text;
