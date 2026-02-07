-- Enable DELETE policy for verifications table
create policy "Users can delete their own verifications" on verifications
  for delete using (auth.uid() = user_id);
