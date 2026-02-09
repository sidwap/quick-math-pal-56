import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Maximize2, 
  Minimize2, 
  User, 
  Type, 
  Settings2,
  RotateCcw,
  CheckCircle2,
  Eye,
  EyeOff,
  ScrollText,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { processText } from '@/utils/textNormalization';
import { compareWords, ComparisonResult } from '@/utils/wordComparison';
import { calculateUPSSSCSpeed } from '@/config/examConfig';
import UPSSSCResults from './UPSSSCResults';

type BackspaceMode = 'full' | 'twoword' | 'oneword' | 'disabled';

interface UPSSSCTypingTestProps {
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

const UPSSSCTypingTest = ({ selectedTest, words, onStartNewTest }: UPSSSCTypingTestProps) => {
  const [typedText, setTypedText] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [timeLeft, setTimeLeft] = useState(selectedTest.time_limit || 300);
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
  
  // Result state
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

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(() => {});
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  // Font size controls
  const increaseFontSize = () => {
    if (fontSize < 24) setFontSize(prev => prev + 2);
  };

  const decreaseFontSize = () => {
    if (fontSize > 12) setFontSize(prev => prev - 2);
  };

  // Start timer on first keystroke
  const startTimer = useCallback(() => {
    if (!isActive && !isFinished) {
      setIsActive(true);
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
    }
  }, [isActive, isFinished]);

  // Timer effect with precise timing
  useEffect(() => {
    if (!isActive || isFinished) return;

    const intervalId = setInterval(() => {
      if (startTimeRef.current === null) return;
      
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = (selectedTest.time_limit || 300) - elapsed;
      
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

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Helper to find nth last space index
  const findNthLastSpaceIndex = (text: string, n: number): number => {
    let count = 0;
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === ' ') {
        count++;
        if (count === n) {
          return i;
        }
      }
    }
    return -1;
  };

  // Get current word index based on spaces typed
  const getCurrentWordIndex = useCallback((text: string): number => {
    if (text.length === 0) return 0;
    // Count spaces to determine which word we're on
    const spaceCount = (text.match(/ /g) || []).length;
    // If text ends with space, we're on the next word
    if (text.endsWith(' ')) {
      return spaceCount;
    }
    return spaceCount;
  }, []);

  // Get typed words array (completed words only)
  const getTypedWords = useCallback((text: string): string[] => {
    if (text.length === 0) return [];
    const parts = text.split(' ');
    // If text ends with space, all parts are complete words (except last empty string)
    if (text.endsWith(' ')) {
      return parts.slice(0, -1);
    }
    // Otherwise, last part is incomplete - return all but last
    return parts.slice(0, -1);
  }, []);

  // Handle typing input - simplified and robust
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    
    // Start timer on first character
    if (newValue.length > 0 && !isActive) {
      startTimer();
    }

    // Handle backspace restrictions
    if (newValue.length < typedText.length) {
      if (backspaceMode === 'disabled') {
        e.target.value = typedText;
        return;
      } else if (backspaceMode === 'oneword') {
        const lastSpaceIndex = typedText.lastIndexOf(' ');
        const minLength = lastSpaceIndex === -1 ? 0 : lastSpaceIndex + 1;
        if (newValue.length < minLength) {
          e.target.value = typedText.substring(0, minLength);
          return;
        }
      } else if (backspaceMode === 'twoword') {
        const secondLastSpaceIndex = findNthLastSpaceIndex(typedText, 2);
        const minLength = secondLastSpaceIndex === -1 ? 0 : secondLastSpaceIndex + 1;
        if (newValue.length < minLength) {
          e.target.value = typedText.substring(0, minLength);
          return;
        }
      }
    }

    // Apply text normalization only for Hindi special characters
    const finalValue = selectedTest.language === 'hindi' ? processText(newValue) : newValue;
    setTypedText(finalValue);

    // Auto-scroll to current word
    if (autoScroll && paragraphRef.current) {
      const currentIdx = getCurrentWordIndex(finalValue);
      const spans = paragraphRef.current.querySelectorAll('span[data-word]');
      if (spans[currentIdx]) {
        (spans[currentIdx] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  // Key handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent copy/paste
    if ((e.ctrlKey || e.metaKey) && (
      e.key === 'c' || e.key === 'v' || e.key === 'x' || 
      e.key === 'a' || e.key === 'u' || e.key === 'z' || e.key === 'y'
    )) {
      e.preventDefault();
      return;
    }
    
    if (e.key === 'Backspace') {
      setBackspaceCount(prev => prev + 1);
    }
  };

  // Render paragraph with highlighting
  // Color scheme: Yellow = current word, Green = correct, Red = wrong, Gray = upcoming
  const renderParagraph = useCallback(() => {
    // Get completed words (words followed by space)
    const completedWords = getTypedWords(typedText);
    const completedCount = completedWords.length;
    
    // Current word index - if text ends with space, we're on the NEXT word
    const currentWordIndex = typedText.endsWith(' ') ? completedCount : completedCount;

    return words.map((originalWord, index) => {
      let className = 'transition-colors duration-150 ';
      let style: React.CSSProperties = {};
      
      if (highlightEnabled) {
        if (index < completedCount) {
          // Completed word - check if correct or wrong
          const typedWord = completedWords[index] || '';
          if (typedWord === originalWord) {
            // Correct - Green
            className += 'font-semibold';
            style = { color: 'hsl(142, 71%, 45%)' }; // green
          } else {
            // Wrong - Red
            className += 'font-semibold';
            style = { color: 'hsl(0, 84%, 60%)' }; // red
          }
        } else if (index === currentWordIndex) {
          // Current word being typed - Yellow with background
          // className += 'font-bold';
          style = { 
            color: 'hsl(0, 0%, 0%)', // black
            backgroundColor: 'hsla(48, 96%, 53%, 0.65)',
            padding: '2px 4px',
            borderRadius: '3px',
            margin: '0 -2px'
          };
        } else {
          // Upcoming words - muted
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

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (isFinished) return;
    
    setIsActive(false);
    setIsFinished(true);
    
    const endTime = Date.now();
    const timeTaken = startTimeRef.current ? (endTime - startTimeRef.current) / 1000 : selectedTest.time_limit || 300;
    const timeInMinutes = timeTaken / 60;
    
    // Word comparison
    const comparisonResult = compareWords(originalText, typedText.trim());
    const { stats } = comparisonResult;
    
    // UPSSSC-specific calculations
    const totalKeystrokes = typedText.length;
    const upssscCalc = calculateUPSSSCSpeed(
      totalKeystrokes,
      stats.totalErrors,
      timeInMinutes,
      5,  // admissible errors
      5   // penalty per extra error
    );

    // Word-based speeds for comparison
    const actualTypedWords = comparisonResult.typedComparison.filter(item => item.status !== 'skipped').length;
    const wordGrossSpeed = timeInMinutes > 0 ? actualTypedWords / timeInMinutes : 0;
    const wordNetSpeed = timeInMinutes > 0 ? stats.correctWords / timeInMinutes : 0;
    
    const isHindi = selectedTest.language?.toLowerCase() === 'hindi';
    const minSpeed = isHindi ? 25 : 30;
    const isQualified = upssscCalc.finalSpeed >= minSpeed;

    const mm = Math.floor(timeTaken / 60);
    const ss = Math.floor(timeTaken % 60);

    const resultData = {
      testName: selectedTest.title,
      language: isHindi ? 'Hindi' : 'English',
      grossSpeed: wordGrossSpeed,
      netSpeed: wordNetSpeed,
      keystrokeGrossSpeed: timeInMinutes > 0 ? upssscCalc.grossWords / timeInMinutes : 0,
      keystrokeNetSpeed: upssscCalc.finalSpeed,
      accuracy: stats.accuracy,
      timeTaken: `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`,
      totalWords: stats.totalWords,
      wordsTyped: actualTypedWords,
      correctWords: stats.correctWords,
      wrongWords: stats.totalErrors,
      totalKeystrokes: originalText.length,
      typedKeystrokes: totalKeystrokes,
      backspaceCount,
      // UPSSSC-specific
      upssscGrossWords: upssscCalc.grossWords,
      upssscPenalty: upssscCalc.penalty,
      upssscNetCorrectWords: upssscCalc.netCorrectWords,
      upssscFinalSpeed: upssscCalc.finalSpeed,
      admissibleErrors: 5,
      excessErrors: Math.max(0, stats.totalErrors - 5),
      isQualified,
    };

    setResult(resultData);
    setComparison(comparisonResult);

    // Exit fullscreen
    try { document.exitFullscreen?.(); } catch {}

    // Save to database
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && selectedTest.id !== 'custom-text') {
        const { error: insertError } = await supabase.from('test_results').insert([{
          user_id: user.id,
          test_id: selectedTest.id,
          wpm: Math.round(upssscCalc.finalSpeed),
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
          exam_type: 'upsssc_junior_assistant',
          skipped_words: stats.skippedWords,
          extra_words: stats.extraWords,
          gross_speed: wordGrossSpeed,
          net_speed: upssscCalc.finalSpeed,
          backspace_count: backspaceCount,
          is_qualified: isQualified,
          typed_text: typedText
        }]);
        
        if (insertError) {
          console.error('Error saving UPSSSC results:', insertError);
          toast({
            title: "Error saving results",
            description: "Your results couldn't be saved.",
            variant: "destructive"
          });
        } else {
          if (isQualified) {
            toast({
              title: "🎉 Congratulations! You QUALIFIED! 🏆",
              description: `UPSSSC JA Speed: ${upssscCalc.finalSpeed.toFixed(1)} WPM | Accuracy: ${stats.accuracy.toFixed(1)}%`,
              className: "bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 text-white border-none shadow-2xl",
            });
          } else {
            toast({
              title: "💪 Better Luck Next Time!",
              description: `Speed: ${upssscCalc.finalSpeed.toFixed(1)} WPM | You need ${minSpeed} WPM to qualify.`,
              className: "bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white border-none shadow-2xl",
            });
          }
        }
      }
    } catch (error) {
      console.error('Error saving UPSSSC results:', error);
    }
  }, [isFinished, typedText, originalText, selectedTest, backspaceCount, words]);

  // Handle cancel/reset
  const handleCancel = () => {
    setTypedText('');
    setTimeLeft(selectedTest.time_limit || 300);
    setIsActive(false);
    setIsFinished(false);
    setStartTime(null);
    startTimeRef.current = null;
    setBackspaceCount(0);
    setResult(null);
    setComparison(null);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Show results if finished
  if (result && comparison) {
    return (
      <UPSSSCResults
        result={result}
        comparison={comparison}
        originalText={originalText}
        testDuration={selectedTest.time_limit || 300}
        onStartNewTest={onStartNewTest}
      />
    );
  }

  return (
    <div className="upsssc-fullscreen" onContextMenu={(e) => e.preventDefault()}>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Maximize2 className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            <div className="hidden sm:block">
              <h1 className="text-sm sm:text-lg font-bold text-foreground">
                UPSSSC Junior Assistant - {selectedTest.language === 'hindi' ? 'Hindi' : 'English'} Typing
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-sm text-muted-foreground">Time left:</span>
              <span className={`ml-2 text-lg font-semibold ${timeLeft <= 30 ? 'text-destructive animate-pulse' : 'text-foreground'}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
          </div>
        </header>

        {/* Blue Info Bar */}
        <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center gap-8 shrink-0">
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
            <span className="text-sm">{Math.floor((selectedTest.time_limit || 300) / 60)} min</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Speed Formula:</span>
            <span className="text-sm">5 keystrokes = 1 word</span>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full flex flex-col min-h-0">
          {/* Font Size Controls */}
          <div className="flex items-center gap-2 mb-4 shrink-0 flex-wrap">
            <span className="text-sm text-muted-foreground">Font Size:</span>
            <button
              onClick={decreaseFontSize}
              className="px-2 py-1 bg-muted hover:bg-muted/80 rounded text-sm font-medium transition-colors"
              disabled={fontSize <= 12}
            >
              A-
            </button>
            <span className="text-sm font-medium text-foreground min-w-[40px] text-center">
              {fontSize}px
            </span>
            <button
              onClick={increaseFontSize}
              className="px-2 py-1 bg-muted hover:bg-muted/80 rounded text-sm font-medium transition-colors"
              disabled={fontSize >= 24}
            >
              A+
            </button>
            
            <div className="flex-1" />

            {/* Sound toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded transition-colors ${soundEnabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              title={soundEnabled ? 'Turn off sound' : 'Turn on sound'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            
            {/* Settings Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4" />
              Settings
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
            <p className="whitespace-pre-wrap leading-loose">
              {renderParagraph()}
            </p>
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
              className="w-full h-32 p-4 border-2 border-primary rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-base bg-card text-foreground"
              style={{ fontSize: `${fontSize}px`,
                fontFamily: selectedTest.language === 'hindi' ? 'Mangal, "Noto Sans Devanagari", sans-serif' : 'inherit'
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
              <div className="text-2xl font-bold text-primary">{typedText.length}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Keystrokes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
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
            <Button
              variant="destructive"
              size="lg"
              onClick={handleCancel}
              className="px-8"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={handleSubmit}
              className="px-8"
              disabled={!isActive}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Submit
            </Button>
          </div>
        </main>
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              Typing Settings
            </DialogTitle>
            <DialogDescription>
              Customize your UPSSSC Junior Assistant typing practice
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Highlight Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {highlightEnabled ? (
                  <Eye className="w-5 h-5 text-primary" />
                ) : (
                  <EyeOff className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <Label htmlFor="highlight" className="font-medium">
                    Highlight Text
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Show color-coded feedback while typing
                  </p>
                </div>
              </div>
              <Switch
                id="highlight"
                checked={highlightEnabled}
                onCheckedChange={setHighlightEnabled}
              />
            </div>

            {/* Auto Scroll Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ScrollText className="w-5 h-5 text-primary" />
                <div>
                  <Label htmlFor="autoscroll" className="font-medium">
                    Auto Scroll
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically scroll to current word
                  </p>
                </div>
              </div>
              <Switch
                id="autoscroll"
                checked={autoScroll}
                onCheckedChange={setAutoScroll}
              />
            </div>

            {/* Backspace Mode */}
            <div className="space-y-3">
              <Label className="font-medium flex items-center gap-2">
                <Type className="w-5 h-5 text-primary" />
                Backspace Mode
              </Label>
              <Select value={backspaceMode} onValueChange={(v) => setBackspaceMode(v as BackspaceMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select backspace mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="twoword">
                    <div className="flex flex-col">
                      <span>Two Words Back (UPSSSC)</span>
                      <span className="text-xs text-muted-foreground">Backspace allowed for 2 words - Official UPSSSC rule</span>
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

export default UPSSSCTypingTest;
