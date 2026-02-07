import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "./ui/card";
import { Trophy, Medal, Award, Zap, Target, Crown, Filter, Calendar as CalendarIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { format } from "date-fns";
import { useState } from "react";
import { getAvailableExams, getExamShortName, type ExamType } from "@/config/examConfig";

interface LeaderboardProps {
  testId?: string;
  currentUserId?: string;
  defaultExamType?: ExamType;
}

interface LeaderboardEntry {
  result_id: string;
  user_id: string;
  wpm: number;
  accuracy: number;
  time_taken: number;
  total_words: number;
  display_name: string;
  exam_type?: string;
  completed_at?: string;
  language?: string;
}

export const Leaderboard = ({ testId, currentUserId, defaultExamType }: LeaderboardProps) => {
  const [selectedExamType, setSelectedExamType] = useState<string>(defaultExamType || 'all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all_time' | 'today' | 'week' | 'month' | 'custom'>('all_time');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);

  const availableExams = getAvailableExams();

  // Get date range based on filter
  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case 'today':
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { start: todayStart.toISOString(), end: now.toISOString() };
      case 'week':
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { start: weekStart.toISOString(), end: now.toISOString() };
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: monthStart.toISOString(), end: now.toISOString() };
      case 'custom':
        if (customDate) {
          const dayStart = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate());
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
          return { start: dayStart.toISOString(), end: dayEnd.toISOString() };
        }
        return null;
      default:
        return null;
    }
  };

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['leaderboard', testId, selectedExamType, selectedLanguage, dateFilter, customDate?.toISOString()],
    queryFn: async () => {
      // Get date range for filters
      const dateRange = getDateRange();
      
      // Use the database function that bypasses RLS for public leaderboard
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_exam_type: selectedExamType === 'all' ? null : selectedExamType,
        p_language: selectedLanguage === 'all' ? null : selectedLanguage,
        p_date_start: dateRange?.start || null,
        p_date_end: dateRange?.end || null,
        p_limit: 100
      });
      
      if (error) throw error;
      
      return (data || []) as LeaderboardEntry[];
    },
  });

  const { data: userRank } = useQuery({
    queryKey: ['user-rank', testId, currentUserId, selectedExamType, dateFilter],
    queryFn: async () => {
      if (!currentUserId) return null;

      const qualified = leaderboard || [];
      const userIndex = qualified.findIndex(r => r.user_id === currentUserId);
      
      return userIndex >= 0 ? userIndex + 1 : null;
    },
    enabled: !!currentUserId && !!leaderboard,
  });

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Crown className="w-6 h-6 text-yellow-500" />;
      case 1:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 2:
        return <Award className="w-6 h-6 text-amber-600" />;
      default:
        return <Trophy className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getRankBadge = (index: number) => {
    switch (index) {
      case 0:
        return <Badge className="bg-gradient-to-r from-yellow-500 to-yellow-600">🥇 Champion</Badge>;
      case 1:
        return <Badge className="bg-gradient-to-r from-gray-400 to-gray-500">🥈 Elite</Badge>;
      case 2:
        return <Badge className="bg-gradient-to-r from-amber-600 to-amber-700">🥉 Master</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Leaderboard</h2>
            <p className="text-sm text-muted-foreground">
              Top performers (85%+ accuracy, 10min+ or 400+ words)
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Exam Type Filter */}
          <Select value={selectedExamType} onValueChange={setSelectedExamType}>
            <SelectTrigger className="w-[160px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Exam Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Exams</SelectItem>
              {availableExams.map(exam => (
                <SelectItem key={exam.id} value={exam.id}>
                  {exam.shortName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Language Filter */}
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              <SelectItem value="english">English</SelectItem>
              <SelectItem value="hindi">Hindi</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
            <SelectTrigger className="w-[140px]">
              <CalendarIcon className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_time">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom Date</SelectItem>
            </SelectContent>
          </Select>

          {/* Custom Date Picker */}
          {dateFilter === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[140px]">
                  {customDate ? format(customDate, "MMM d, yyyy") : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={customDate}
                  onSelect={setCustomDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {currentUserId && userRank && (
        <Card className="mb-4 p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">#{userRank}</span>
              </div>
              <div>
                <p className="font-semibold">Your Rank</p>
                <p className="text-sm text-muted-foreground">Keep practicing to climb higher!</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      <ScrollArea className="h-[500px]">
        <div className="space-y-3">
           {leaderboard && leaderboard.length > 0 ? (
            leaderboard.map((result, index) => (
              <Card
                key={result.result_id}
                className={`p-4 transition-all hover:shadow-md ${
                  result.user_id === currentUserId
                    ? 'border-primary/50 bg-primary/5'
                    : index < 3
                    ? 'border-primary/20'
                    : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-12">
                    {getRankIcon(index)}
                  </div>
                  
                   <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-semibold truncate">
                        {result.display_name || 'Anonymous'}
                      </p>
                      {getRankBadge(index)}
                      {result.user_id === currentUserId && (
                        <Badge variant="outline" className="text-xs">You</Badge>
                      )}
                      {result.exam_type && result.exam_type !== 'all_exam' && (
                        <Badge variant="secondary" className="text-xs">
                          {getExamShortName(result.exam_type)}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm flex-wrap">
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-primary" />
                        <span className="font-bold text-primary">{Math.round(result.wpm)} WPM</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Target className="w-3 h-3 text-green-500" />
                        <span>{result.accuracy.toFixed(1)}%</span>
                      </div>
                      <div className="text-muted-foreground">
                        {result.time_taken >= 60 
                          ? `${Math.floor(result.time_taken / 60)}:${(result.time_taken % 60).toString().padStart(2, '0')}`
                          : `${result.time_taken}s`
                        } | {result.total_words || 0} words
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold text-muted-foreground">
                      #{index + 1}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-8 text-center">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                No qualified results yet. Be the first to rank!
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Requirements: 85%+ accuracy and (10+ minutes or 400+ words)
              </p>
            </Card>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
};
