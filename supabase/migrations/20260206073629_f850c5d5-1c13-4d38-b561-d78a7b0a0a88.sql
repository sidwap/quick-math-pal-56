-- Update the get_leaderboard function to support language filter
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_exam_type TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  p_date_start TIMESTAMPTZ DEFAULT NULL,
  p_date_end TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  result_id UUID,
  user_id UUID,
  wpm NUMERIC,
  accuracy NUMERIC,
  time_taken INTEGER,
  total_words INTEGER,
  display_name TEXT,
  exam_type TEXT,
  completed_at TIMESTAMPTZ,
  language TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tr.id AS result_id,
    tr.user_id,
    tr.wpm,
    tr.accuracy,
    tr.time_taken,
    tr.total_words,
    COALESCE(p.full_name, p.email, 'Anonymous') AS display_name,
    tr.exam_type,
    tr.completed_at,
    tt.language
  FROM test_results tr
  LEFT JOIN profiles p ON tr.user_id = p.id
  LEFT JOIN typing_tests tt ON tr.test_id = tt.id
  WHERE 
    tr.accuracy >= 85
    AND (tr.time_taken >= 600 OR tr.total_words >= 400)
    AND (p_exam_type IS NULL OR tr.exam_type = p_exam_type)
    AND (p_language IS NULL OR LOWER(tt.language) = LOWER(p_language))
    AND (p_date_start IS NULL OR tr.completed_at >= p_date_start)
    AND (p_date_end IS NULL OR tr.completed_at <= p_date_end)
  ORDER BY tr.wpm DESC, tr.accuracy DESC
  LIMIT p_limit;
END;
$$;