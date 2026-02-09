-- Drop existing function overloads and recreate with new return type
DROP FUNCTION IF EXISTS public.get_leaderboard(text, text, timestamp with time zone, timestamp with time zone, integer);
DROP FUNCTION IF EXISTS public.get_leaderboard(text, timestamp with time zone, timestamp with time zone, integer);

-- Recreate get_leaderboard function with gross_speed and total_keystrokes
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_exam_type text DEFAULT NULL,
  p_language text DEFAULT NULL,
  p_date_start timestamp with time zone DEFAULT NULL,
  p_date_end timestamp with time zone DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  result_id uuid,
  user_id uuid,
  wpm numeric,
  accuracy numeric,
  time_taken integer,
  total_words integer,
  display_name text,
  exam_type text,
  completed_at timestamp with time zone,
  language text,
  gross_speed numeric,
  total_keystrokes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    tt.language,
    tr.gross_speed,
    tr.total_keystrokes
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