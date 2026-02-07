-- Drop and recreate the get_leaderboard function with improved logic
DROP FUNCTION IF EXISTS public.get_leaderboard(uuid);

-- Create improved leaderboard function that works with filters
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_exam_type TEXT DEFAULT NULL,
  p_date_start TIMESTAMPTZ DEFAULT NULL,
  p_date_end TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  result_id UUID,
  user_id UUID,
  wpm NUMERIC,
  accuracy NUMERIC,
  time_taken INT,
  total_words INT,
  exam_type TEXT,
  completed_at TIMESTAMPTZ,
  display_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    tr.id AS result_id,
    tr.user_id,
    tr.wpm,
    tr.accuracy,
    tr.time_taken,
    COALESCE(tr.total_words, 0) AS total_words,
    tr.exam_type,
    tr.completed_at,
    COALESCE(NULLIF(p.full_name, ''), split_part(p.email, '@', 1), 'Anonymous') AS display_name
  FROM public.test_results tr
  LEFT JOIN public.profiles p ON p.id = tr.user_id
  WHERE tr.accuracy >= 85
    AND (tr.time_taken >= 600 OR COALESCE(tr.total_words, 0) >= 400)
    AND (p_exam_type IS NULL OR p_exam_type = 'all' OR tr.exam_type = p_exam_type)
    AND (p_date_start IS NULL OR tr.completed_at >= p_date_start)
    AND (p_date_end IS NULL OR tr.completed_at <= p_date_end)
  ORDER BY tr.wpm DESC, tr.accuracy DESC, tr.time_taken DESC
  LIMIT p_limit;
$$;