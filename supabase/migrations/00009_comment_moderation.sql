-- Let comment authors and rating owners remove comments from their posts.
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;

CREATE POLICY "Comment authors and post owners can delete comments"
  ON comments FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM ratings
      WHERE ratings.id = comments.rating_id
        AND ratings.user_id = auth.uid()
    )
  );
