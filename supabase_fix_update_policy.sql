-- Enable UPDATE policy for verifications table
create policy "Users can update their own verifications" on verifications
  for update using (auth.uid() = user_id);
