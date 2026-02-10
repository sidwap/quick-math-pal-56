import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Maximize2, Minimize2, User, Type, Settings2, RotateCcw, 
  CheckCircle2, Eye, EyeOff, ScrollText, Volume2, VolumeX, Train
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { processText } from '@/utils/textNormalization';
import { compareWords, ComparisonResult } from '@/utils/wordComparison';
import RRBNTPCResults from './RRBNTPCResults';

type BackspaceMode = 'full' | 'twoword' | 'oneword' | 'disabled';

interface RRBNTPCTypingTestProps {
  selectedTest: {
    id: string;
    title: string;
    content: string;
    language: 'english' | 'hindi';
    time_limit: number;
  };
  words: string[];
  onStartNewTest: () => void;
}

const RRBNTPCTypingTest = ({ selectedTest, words, onStartNewTest }: RRBNTPCTypingTestProps) => {
  const [typedText, setTypedText] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [timeLeft, setTimeLeft] = useState(selectedTest.time_limit || 600);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [backspaceMode, setBackspaceMode] = useState<BackspaceMode>('twoword');
  const [showSettings, setShowSettings] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [backspaceCount, setBackspaceCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const [result, setResult] = useState<any>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const paragraphRef = useRef<HTMLDivElement>(null);
  const typingHallAudioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const originalText = words.join(' ');

  // Initialize audio
  useEffect(() => {
    typingHallAudioRef.current = new Audio('/audio/typing-hall-sound.m4a');
    typingHallAudioRef.current.loop = true;
    typingHallAudioRef.current.volume = 0.5;
    return () => {
      if (typingHallAudioRef.current) {
        typingHallAudioRef.current.pause();
        typingHallAudioRef.current = null;
      }
    };
  }, []);

  // Control sound
  useEffect(() => {
    const audio = typingHallAudioRef.current;
    if (!audio) return;
    if (isActive && !isFinished && soundEnabled) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [isActive, isFinished, soundEnabled]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  const increaseFontSize = () => { if (fontSize < 24) setFontSize(prev => prev + 2); };
  const decreaseFontSize = () => { if (fontSize > 12) setFontSize(prev => prev - 2); };

  const startTimer = useCallback(() => {
    if (!isActive && !isFinished) {
      setIsActive(true);
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
    }
  }, [isActive, isFinished]);

  // Timer
  useEffect(() => {
    if (!isActive || isFinished) return;
    const intervalId = setInterval(() => {
      if (startTimeRef.current === null) return;
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = (selectedTest.time_limit || 600) - elapsed;
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(intervalId);
        handleSubmit();
      } else {
        setTimeLeft(remaining);
      }
    }, 100);
    return () => clearInterval(intervalId);
  }, [isActive, isFinished, selectedTest.time_limit]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const findNthLastSpaceIndex = (text: string, n: number): number => {
    let count = 0;
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === ' ') { count++; if (count === n) return i; }
    }
    return -1;
  };

  const getCurrentWordIndex = useCallback((text: string): number => {
    if (text.length === 0) return 0;
    const spaceCount = (text.match(/ /g) || []).length;
    return spaceCount;
  }, []);

  const getTypedWords = useCallback((text: string): string[] => {
    if (text.length === 0) return [];
    const parts = text.split(' ');
    return text.endsWith(' ') ? parts.slice(0, -1) : parts.slice(0, -1);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length > 0 && !isActive) startTimer();

    if (newValue.length < typedText.length) {
      if (backspaceMode === 'disabled') { e.target.value = typedText; return; }
      if (backspaceMode === 'oneword') {
        const lastSpaceIndex = typedText.lastIndexOf(' ');
        const minLength = lastSpaceIndex === -1 ? 0 : lastSpaceIndex + 1;
        if (newValue.length < minLength) { e.target.value = typedText.substring(0, minLength); return; }
      } else if (backspaceMode === 'twoword') {
        const secondLastSpaceIndex = findNthLastSpaceIndex(typedText, 2);
        const minLength = secondLastSpaceIndex === -1 ? 0 : secondLastSpaceIndex + 1;
        if (newValue.length < minLength) { e.target.value = typedText.substring(0, minLength); return; }
      }
    }

    const finalValue = selectedTest.language === 'hindi' ? processText(newValue) : newValue;
    setTypedText(finalValue);

    if (autoScroll && paragraphRef.current) {
      const currentIdx = getCurrentWordIndex(finalValue);
      const spans = paragraphRef.current.querySelectorAll('span[data-word]');
      if (spans[currentIdx]) {
        (spans[currentIdx] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a', 'u', 'z', 'y'].includes(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Backspace') setBackspaceCount(prev => prev + 1);
  };

  const renderParagraph = useCallback(() => {
    const completedWords = getTypedWords(typedText);
    const completedCount = completedWords.length;
    const currentWordIndex = completedCount;

    return words.map((originalWord, index) => {
      let className = 'transition-colors duration-150 ';
      let style: React.CSSProperties = {};
      
      if (highlightEnabled) {
        if (index < completedCount) {
          const typedWord = completedWords[index] || '';
          if (typedWord === originalWord) {
            className += 'font-semibold';
            style = { color: 'hsl(142, 71%, 45%)' };
          } else {
            className += 'font-semibold';
            style = { color: 'hsl(0, 84%, 60%)' };
          }
        } else if (index === currentWordIndex) {
          style = { 
            color: 'hsl(0, 0%, 0%)',
            backgroundColor: 'hsla(210, 80%, 55%, 0.3)',
            padding: '2px 4px',
            borderRadius: '3px',
            margin: '0 -2px'
          };
        } else {
          className += 'text-muted-foreground';
        }
      } else {
        className += 'text-foreground';
      }

      return (
        <span key={index} data-word={index} className={className} style={style}>
          {originalWord}{' '}
        </span>
      );
    });
  }, [typedText, words, highlightEnabled, getTypedWords]);

  const handleSubmit = useCallback(async () => {
    if (isFinished) return;
    setIsActive(false);
    setIsFinished(true);
    
    const endTime = Date.now();
    const timeTaken = startTimeRef.current ? (endTime - startTimeRef.current) / 1000 : selectedTest.time_limit || 600;
    const timeInMinutes = timeTaken / 60;
    
    const comparisonResult = compareWords(originalText, typedText.trim());
    const { stats } = comparisonResult;
    
    // RRB NTPC uses 5 keystrokes = 1 word
    const totalKeystrokes = typedText.length;
    const grossWords = totalKeystrokes / 5;
    const grossSpeed = timeInMinutes > 0 ? grossWords / timeInMinutes : 0;
    
    // Net speed: (totalKeystrokes/5 - errors) / time
    const netWords = Math.max(0, grossWords - stats.totalErrors);
    const netSpeed = timeInMinutes > 0 ? netWords / timeInMinutes : 0;

    // Word-based speeds
    const actualTypedWords = comparisonResult.typedComparison.filter(item => item.status !== 'skipped').length;
    const wordGrossSpeed = timeInMinutes > 0 ? actualTypedWords / timeInMinutes : 0;
    const wordNetSpeed = timeInMinutes > 0 ? stats.correctWords / timeInMinutes : 0;
    
    const isHindi = selectedTest.language?.toLowerCase() === 'hindi';
    const minSpeed = isHindi ? 25 : 30;
    const isQualified = netSpeed >= minSpeed;

    const mm = Math.floor(timeTaken / 60);
    const ss = Math.floor(timeTaken % 60);

    const resultData = {
      testName: selectedTest.title,
      language: isHindi ? 'Hindi' : 'English',
      grossSpeed: wordGrossSpeed,
      netSpeed: wordNetSpeed,
      keystrokeGrossSpeed: grossSpeed,
      keystrokeNetSpeed: netSpeed,
      accuracy: stats.accuracy,
      timeTaken: `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`,
      totalWords: stats.totalWords,
      wordsTyped: actualTypedWords,
      correctWords: stats.correctWords,
      wrongWords: stats.totalErrors,
      totalKeystrokes: originalText.length,
      typedKeystrokes: totalKeystrokes,
      backspaceCount,
      // RRB NTPC specific
      rrbGrossWords: grossWords,
      rrbNetWords: netWords,
      rrbGrossSpeed: grossSpeed,
      rrbNetSpeed: netSpeed,
      isQualified,
    };

    setResult(resultData);
    setComparison(comparisonResult);

    try { document.exitFullscreen?.(); } catch {}

    // Save to database
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && selectedTest.id !== 'custom-text') {
        const { error: insertError } = await supabase.from('test_results').insert([{
          user_id: user.id,
          test_id: selectedTest.id,
          wpm: Math.round(netSpeed),
          gross_wpm: Math.round(wordGrossSpeed),
          accuracy: stats.accuracy,
          total_words: stats.totalWords,
          typed_words: actualTypedWords,
          correct_words_count: stats.correctWords,
          incorrect_words: stats.wrongWords,
          total_keystrokes: originalText.length,
          correct_keystrokes: totalKeystrokes,
          wrong_keystrokes: 0,
          errors: stats.totalErrors,
          time_taken: Math.round(timeTaken),
          exam_type: 'rrb_ntpc',
          skipped_words: stats.skippedWords,
          extra_words: stats.extraWords,
          gross_speed: wordGrossSpeed,
          net_speed: netSpeed,
          backspace_count: backspaceCount,
          is_qualified: isQualified,
          typed_text: typedText
        }]);
        
        if (insertError) {
          console.error('Error saving RRB NTPC results:', insertError);
          toast({ title: "Error saving results", description: "Your results couldn't be saved.", variant: "destructive" });
        } else {
          if (isQualified) {
            toast({
              title: "🎉 Congratulations! You QUALIFIED! 🏆",
              description: `RRB NTPC Speed: ${netSpeed.toFixed(1)} WPM | Accuracy: ${stats.accuracy.toFixed(1)}%`,
              className: "bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white border-none shadow-2xl",
            });
          } else {
            toast({
              title: "💪 Better Luck Next Time!",
              description: `Speed: ${netSpeed.toFixed(1)} WPM | You need ${minSpeed} WPM to qualify.`,
              className: "bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white border-none shadow-2xl",
            });
          }
        }
      }
    } catch (error) {
      console.error('Error saving RRB NTPC results:', error);
    }
  }, [isFinished, typedText, originalText, selectedTest, backspaceCount, words]);

  const handleCancel = () => {
    setTypedText('');
    setTimeLeft(selectedTest.time_limit || 600);
    setIsActive(false);
    setIsFinished(false);
    setStartTime(null);
    startTimeRef.current = null;
    setBackspaceCount(0);
    setResult(null);
    setComparison(null);
    if (inputRef.current) inputRef.current.focus();
  };

  // Show results if finished
  if (result && comparison) {
    return (
      <RRBNTPCResults
        result={result}
        comparison={comparison}
        originalText={originalText}
        testDuration={selectedTest.time_limit || 600}
        onStartNewTest={onStartNewTest}
      />
    );
  }

  return (
    <div className="rrb-ntpc-fullscreen" onContextMenu={(e) => e.preventDefault()}>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header - Railway themed */}
        <header className="px-4 py-3 flex items-center justify-between shrink-0" style={{ background: 'linear-gradient(135deg, hsl(220, 70%, 25%), hsl(220, 80%, 35%))' }}>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5 text-white" />
              ) : (
                <Maximize2 className="w-5 h-5 text-white" />
              )}
            </button>
            <div className="flex items-center gap-3">
              <Train className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-300" />
              <div className="hidden sm:block">
                <h1 className="text-sm sm:text-lg font-bold text-white">
                  RRB NTPC - {selectedTest.language === 'hindi' ? 'Hindi' : 'English'} Typing Skill Test
                </h1>
                <p className="text-xs text-blue-200">Railway Recruitment Board • Computer Based Typing Skill Test (CBTST)</p>
              </div>
              <span className="sm:hidden text-xs font-bold text-white">RRB NTPC</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-blue-200">Time left:</span>
              <span className={`ml-2 text-lg font-semibold ${timeLeft <= 60 ? 'text-red-300 animate-pulse' : 'text-white'}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </header>

        {/* Info Bar - Railway blue */}
        <div className="px-4 py-2 flex items-center gap-8 shrink-0 flex-wrap" style={{ background: 'hsl(220, 60%, 45%)', color: 'white' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Keyboard:</span>
            <span className="text-sm">{selectedTest.language === 'hindi' ? 'Inscript/Remington' : 'QWERTY'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Language:</span>
            <span className="text-sm">{selectedTest.language === 'hindi' ? 'Hindi' : 'English'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Duration:</span>
            <span className="text-sm">{Math.floor((selectedTest.time_limit || 600) / 60)} min</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Speed Formula:</span>
            <span className="text-sm">5 keystrokes = 1 word</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Min Required:</span>
            <span className="text-sm font-bold text-yellow-200">
              {selectedTest.language === 'hindi' ? '25 WPM (250 words)' : '30 WPM (300 words)'}
            </span>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full flex flex-col min-h-0">
          {/* Controls */}
          <div className="flex items-center gap-2 mb-4 shrink-0 flex-wrap">
            <span className="text-sm text-muted-foreground">Font Size:</span>
            <button onClick={decreaseFontSize} className="px-2 py-1 bg-muted hover:bg-muted/80 rounded text-sm font-medium transition-colors" disabled={fontSize <= 12}>A-</button>
            <span className="text-sm font-medium text-foreground min-w-[40px] text-center">{fontSize}px</span>
            <button onClick={increaseFontSize} className="px-2 py-1 bg-muted hover:bg-muted/80 rounded text-sm font-medium transition-colors" disabled={fontSize >= 24}>A+</button>
            
            <div className="flex-1" />

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded transition-colors ${soundEnabled ? 'text-white' : 'bg-muted text-muted-foreground'}`}
              style={soundEnabled ? { background: 'hsl(220, 70%, 35%)' } : {}}
              title={soundEnabled ? 'Turn off sound' : 'Turn on sound'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Settings
            </Button>
          </div>

          {/* Paragraph Display */}
          <div 
            ref={paragraphRef}
            className="bg-card border-2 border-border rounded-lg p-4 mb-4 flex-1 min-h-[120px] max-h-[40vh] overflow-y-auto"
            style={{ fontSize: `${fontSize}px`, lineHeight: '1.8',
              fontFamily: selectedTest.language === 'hindi' ? 'Mangal, "Noto Sans Devanagari", sans-serif' : 'inherit'
            }}
            onClick={() => inputRef.current?.focus()}
          >
            <p className="whitespace-pre-wrap leading-loose">{renderParagraph()}</p>
          </div>

          {/* Typing Input */}
          <div className="mb-4 shrink-0">
            <textarea
              ref={inputRef}
              value={typedText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={(e) => e.preventDefault()}
              onCopy={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              placeholder={isActive ? "Keep typing..." : "Start typing to begin the test..."}
              className="w-full h-32 p-4 border-2 rounded-lg resize-none focus:outline-none focus:ring-2 text-base bg-card text-foreground"
              style={{ 
                fontSize: `${fontSize}px`,
                fontFamily: selectedTest.language === 'hindi' ? 'Mangal, "Noto Sans Devanagari", sans-serif' : 'inherit',
                borderColor: 'hsl(220, 70%, 45%)',
              }}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              disabled={isFinished}
            />
          </div>

          {/* Stats Display */}
          <div className="flex items-center justify-center gap-8 mb-6 shrink-0">
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'hsl(220, 70%, 45%)' }}>{typedText.length}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Keystrokes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'hsl(220, 70%, 45%)' }}>
                {Math.floor(typedText.length / 5)}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Words (÷5)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-muted-foreground">{backspaceCount}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Backspace</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-4 shrink-0">
            <Button variant="destructive" size="lg" onClick={handleCancel} className="px-8">
              <RotateCcw className="w-4 h-4 mr-2" /> Cancel
            </Button>
            <Button size="lg" onClick={handleSubmit} className="px-8" disabled={!isActive}
              style={{ background: 'hsl(220, 70%, 35%)' }}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> Submit
            </Button>
          </div>
        </main>
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" /> Typing Settings
            </DialogTitle>
            <DialogDescription>Customize your RRB NTPC typing practice</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {highlightEnabled ? <Eye className="w-5 h-5 text-primary" /> : <EyeOff className="w-5 h-5 text-muted-foreground" />}
                <div>
                  <Label htmlFor="highlight" className="font-medium">Highlight Text</Label>
                  <p className="text-sm text-muted-foreground">Show color-coded feedback while typing</p>
                </div>
              </div>
              <Switch id="highlight" checked={highlightEnabled} onCheckedChange={setHighlightEnabled} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ScrollText className="w-5 h-5 text-primary" />
                <div>
                  <Label htmlFor="autoscroll" className="font-medium">Auto Scroll</Label>
                  <p className="text-sm text-muted-foreground">Automatically scroll to current word</p>
                </div>
              </div>
              <Switch id="autoscroll" checked={autoScroll} onCheckedChange={setAutoScroll} />
            </div>

            <div className="space-y-3">
              <Label className="font-medium flex items-center gap-2">
                <Type className="w-5 h-5 text-primary" /> Backspace Mode
              </Label>
              <Select value={backspaceMode} onValueChange={(v) => setBackspaceMode(v as BackspaceMode)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select backspace mode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="twoword">
                    <div className="flex flex-col">
                      <span>Two Words Back</span>
                      <span className="text-xs text-muted-foreground">Backspace allowed for 2 words</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="full">
                    <div className="flex flex-col">
                      <span>Full Backspace</span>
                      <span className="text-xs text-muted-foreground">Allow unlimited backspace</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="oneword">
                    <div className="flex flex-col">
                      <span>One Word Back</span>
                      <span className="text-xs text-muted-foreground">Only backspace to start of current word</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="disabled">
                    <div className="flex flex-col">
                      <span>Backspace Disabled</span>
                      <span className="text-xs text-muted-foreground">No backspace allowed</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RRBNTPCTypingTest;
