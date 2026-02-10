import React from 'react';
import { ComparisonResult } from '@/utils/wordComparison';
import { Button } from '@/components/ui/button';
import { 
  Keyboard, XCircle, Percent, Gauge, Target, Delete, CheckCircle, 
  XOctagon, FileText, Hash, Train
} from 'lucide-react';

interface RRBNTPCResult {
  testName: string;
  language: string;
  grossSpeed: number;
  netSpeed: number;
  keystrokeGrossSpeed: number;
  keystrokeNetSpeed: number;
  accuracy: number;
  timeTaken: string;
  totalWords: number;
  wordsTyped: number;
  correctWords: number;
  wrongWords: number;
  totalKeystrokes: number;
  typedKeystrokes: number;
  backspaceCount: number;
  rrbGrossWords: number;
  rrbNetWords: number;
  rrbGrossSpeed: number;
  rrbNetSpeed: number;
  isQualified: boolean;
}

interface Props {
  result: RRBNTPCResult;
  comparison: ComparisonResult;
  originalText: string;
  testDuration: number;
  onStartNewTest: () => void;
}

const RRBNTPCResults = ({ result, comparison, originalText, testDuration, onStartNewTest }: Props) => {
  const isHindi = result.language?.toLowerCase() === 'hindi';
  const minSpeed = isHindi ? 25 : 30;
  const minWords = isHindi ? 250 : 300;

  const actualTypedWords = comparison.typedComparison.filter(item => item.status !== 'skipped').length;
  const testDurationMinutes = Math.floor(testDuration / 60);

  const renderTypedText = () => {
    return comparison.typedComparison.map((item, index) => {
      switch (item.status) {
        case 'correct': return <span key={index} className="text-foreground">{item.word}{' '}</span>;
        case 'wrong': return <span key={index}><span className="text-red-500 font-semibold">{item.word}</span><span className="text-green-500 font-semibold">{`{${item.expectedWord}}`}</span>{' '}</span>;
        case 'skipped': return <span key={index} className="text-violet-500 font-semibold">{item.word}{' '}</span>;
        case 'extra': return <span key={index} className="text-orange-500 line-through font-semibold">{item.word}{' '}</span>;
        default: return <span key={index}>{item.word} </span>;
      }
    });
  };

  const StatCard = ({ label, value, icon: Icon, valueColor }: { label: string; value: string | number; icon: React.ElementType; valueColor?: string }) => (
    <div className="bg-secondary/50 border border-border rounded-xl p-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
        <p className={`text-xl sm:text-2xl font-bold ${valueColor || 'text-foreground'}`}>{value}</p>
      </div>
      <Icon className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
    </div>
  );

  const rrbBlue = 'hsl(220, 70%, 35%)';

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header Info - Railway themed */}
        <div className="rounded-xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${rrbBlue}, hsl(220, 80%, 25%))` }}>
          <div className="flex items-center gap-3 mb-4">
            <Train className="w-8 h-8 text-yellow-300" />
            <h2 className="text-xl font-bold">RRB NTPC Typing Skill Test Result</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-white/70">Exam Title</p>
              <p className="font-bold">RRB NTPC {result.language} Typing</p>
            </div>
            <div>
              <p className="text-xs text-white/70">Total Words Given</p>
              <p className="font-bold">{comparison.stats.totalWords}</p>
            </div>
            <div>
              <p className="text-xs text-white/70">Typing Date</p>
              <p className="font-bold">{new Date().toLocaleDateString('en-IN')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/20">
            <div>
              <p className="text-xs text-white/70">Passage Title</p>
              <p className="font-semibold">{result.testName}</p>
            </div>
            <div>
              <p className="text-xs text-white/70">Time Duration</p>
              <p className="font-semibold">{testDurationMinutes}:00 min.</p>
            </div>
            <div>
              <p className="text-xs text-white/70">Time Taken</p>
              <p className="font-semibold">{result.timeTaken} min.</p>
            </div>
          </div>
        </div>

        {/* RRB NTPC Speed Calculation Card */}
        <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
          <h4 className="font-bold text-white p-4 text-center text-lg" style={{ background: rrbBlue }}>
            RRB NTPC Speed Calculation (5 Keystrokes = 1 Word)
          </h4>
          <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="text-center p-3 bg-background rounded-lg border">
              <p className="text-2xl font-bold" style={{ color: rrbBlue }}>{result.typedKeystrokes}</p>
              <p className="text-xs text-muted-foreground">Total Keystrokes</p>
            </div>
            <div className="text-center p-3 bg-background rounded-lg border">
              <p className="text-2xl font-bold text-foreground">{result.rrbGrossWords.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Gross Words (÷5)</p>
            </div>
            <div className="text-center p-3 bg-background rounded-lg border">
              <p className="text-2xl font-bold text-destructive">{comparison.stats.totalErrors}</p>
              <p className="text-xs text-muted-foreground">Total Errors</p>
            </div>
            <div className="text-center p-3 bg-background rounded-lg border">
              <p className="text-2xl font-bold text-green-600">{result.rrbNetWords.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Net Words</p>
            </div>
            <div className="text-center p-3 bg-background rounded-lg border">
              <p className={`text-2xl font-bold ${result.isQualified ? 'text-green-600' : 'text-destructive'}`}>
                {result.rrbNetSpeed.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">Net Speed (WPM)</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Words Typed" value={actualTypedWords} icon={Keyboard} />
          <StatCard label="Correct Words" value={comparison.stats.correctWords} icon={CheckCircle} valueColor="text-green-600" />
          <StatCard label="Total Errors" value={comparison.stats.totalErrors} icon={XCircle} valueColor="text-destructive" />
          <StatCard label="Accuracy %" value={`${comparison.stats.accuracy}`} icon={Percent} valueColor="text-primary" />
          <StatCard label={`Min Speed: ${minSpeed} WPM`} value={Number(result.rrbNetSpeed).toFixed(2)} icon={Gauge} />
          <StatCard label="Backspace Count" value={result.backspaceCount} icon={Delete} />
          <StatCard label="Gross Speed (Keystroke)" value={Number(result.rrbGrossSpeed).toFixed(2)} icon={Gauge} valueColor="text-blue-600" />
          <div className={`border rounded-xl p-4 flex items-center justify-between gap-3 ${result.isQualified ? 'bg-green-500/10 border-green-500' : 'bg-destructive/10 border-destructive'}`}>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Status</p>
              <p className={`text-xl sm:text-2xl font-bold ${result.isQualified ? 'text-green-600' : 'text-destructive'}`}>
                {result.isQualified ? 'Qualified' : 'Not Qualified'}
              </p>
            </div>
            {result.isQualified ? <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" /> : <Target className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />}
          </div>
        </div>

        {/* Word-based speed row */}
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 sm:gap-4">
          <StatCard label="Gross Speed (Word-based)" value={Number(result.grossSpeed).toFixed(2)} icon={Gauge} valueColor="text-blue-600" />
          <StatCard label="Net Speed (Word-based)" value={Number(result.netSpeed).toFixed(2)} icon={Gauge} valueColor="text-emerald-600" />
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          <StatCard label="Wrong Words" value={comparison.stats.wrongWords} icon={XOctagon} valueColor="text-red-500" />
          <StatCard label="Skipped Words" value={comparison.stats.skippedWords} icon={Hash} valueColor="text-violet-500" />
          <StatCard label="Extra Words" value={comparison.stats.extraWords} icon={Hash} valueColor="text-orange-500" />
          <StatCard label="Total Keystrokes (Passage)" value={result.totalKeystrokes} icon={FileText} />
          <StatCard label={`Min Words Required`} value={minWords} icon={FileText} />
        </div>

        {/* Comparison Section */}
        <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
          <h4 className="font-bold text-white p-4 text-center text-lg" style={{ background: rrbBlue }}>
            Paragraph Comparison
          </h4>
          <div className="grid grid-cols-2 bg-secondary border-b border-border">
            <div className="p-3 text-center font-bold text-foreground border-r border-border text-sm sm:text-base italic">Question Paragraph</div>
            <div className="p-3 text-center font-bold text-foreground text-sm sm:text-base italic">Result Paragraph</div>
          </div>
          <div className="grid grid-cols-2">
            <div className="p-4 border-r border-border bg-background">
              <div className="text-sm sm:text-base leading-loose text-justify">{originalText}</div>
            </div>
            <div className="p-4 bg-background">
              <div className="text-sm sm:text-base leading-loose text-justify">{renderTypedText()}</div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
          <h4 className="font-bold text-white p-4 text-center" style={{ background: rrbBlue }}>Color Legend</h4>
          <div className="flex flex-wrap gap-4 justify-center text-xs sm:text-sm p-4">
            <span><span className="text-red-500 font-semibold">Red</span> = Wrong word</span>
            <span><span className="text-green-500 font-semibold">{'{Green}'}</span> = Correct word</span>
            <span><span className="text-violet-500 font-semibold">Violet</span> = Skipped word</span>
            <span><span className="text-orange-500 line-through">Orange Strikethrough</span> = Extra word</span>
          </div>
        </div>

        {/* Speed Formula */}
        <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
          <h4 className="font-bold text-white p-4 text-center" style={{ background: rrbBlue }}>
            Speed Calculation Formula (गति गणना सूत्र)
          </h4>
          <div className="text-center text-sm sm:text-base p-4 space-y-3">
            <div className="bg-background rounded-lg p-3 border">
              <p className="font-semibold">Step 1: Total Keystrokes ÷ 5 = Gross Words</p>
              <p className="font-bold" style={{ color: rrbBlue }}>{result.typedKeystrokes} ÷ 5 = {result.rrbGrossWords.toFixed(1)}</p>
            </div>
            <div className="bg-background rounded-lg p-3 border">
              <p className="font-semibold">Step 2: Gross Words - Errors = Net Words</p>
              <p className="font-bold" style={{ color: rrbBlue }}>
                {result.rrbGrossWords.toFixed(1)} - {comparison.stats.totalErrors} = {result.rrbNetWords.toFixed(1)}
              </p>
            </div>
            <div className="bg-background rounded-lg p-3 border">
              <p className="font-semibold">Step 3: Net Speed = Net Words ÷ Time (minutes)</p>
              <p className="font-bold" style={{ color: rrbBlue }}>
                {result.rrbNetWords.toFixed(1)} ÷ {(testDuration / 60).toFixed(2)} = {result.rrbNetSpeed.toFixed(2)} WPM
              </p>
            </div>
          </div>
        </div>

        {/* Accuracy Formula */}
        <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
          <h4 className="font-bold text-white p-4 text-center" style={{ background: rrbBlue }}>
            Accuracy Calculation (शुद्धता का निर्धारण)
          </h4>
          <div className="text-center text-sm sm:text-base p-4">
            <p className="font-semibold">शुद्धता = (शुद्ध शब्दों की संख्या × 100) ÷ कुल शब्दों की संख्या</p>
            <p className="mt-2">Accuracy = (Correct Words × 100) ÷ Total Words</p>
            <p className="mt-2 font-bold" style={{ color: rrbBlue }}>
              = ({comparison.stats.correctWords} × 100) ÷ {comparison.stats.totalWords} = {comparison.stats.accuracy}%
            </p>
          </div>
        </div>

        {/* Qualification Criteria */}
        <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
          <h4 className="font-bold text-white p-4 text-center" style={{ background: rrbBlue }}>
            Qualification Criteria (उत्तीर्ण मानदंड)
          </h4>
          <div className="text-sm sm:text-base space-y-2 p-4">
            <p>RRB NTPC Computer Based Typing Skill Test (CBTST) qualifying criteria:</p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li><strong>English: Minimum 30 WPM</strong> (at least 300 words in 10 minutes)</li>
              <li><strong>Hindi: Minimum 25 WPM</strong> (at least 250 words in 10 minutes)</li>
              <li><strong>Duration: 10 Minutes</strong></li>
              <li><strong>Speed Formula:</strong> 5 keystrokes = 1 word</li>
              <li><strong>Posts:</strong> Sr. Clerk cum Typist, Jr. Clerk cum Typist, Jr. Account Assistant cum Typist, Sr. Time Keeper, Accounts Clerk cum Typist</li>
            </ul>
            <div className={`mt-3 p-3 rounded-lg ${result.isQualified ? 'bg-green-500/10 border border-green-500' : 'bg-destructive/10 border border-destructive'}`}>
              <p className="font-bold text-center">
                Your Speed: {result.rrbNetSpeed.toFixed(2)} WPM | Required: {minSpeed} WPM
              </p>
              <p className={`text-center font-bold mt-1 ${result.isQualified ? 'text-green-600' : 'text-destructive'}`}>
                {result.isQualified ? '✓ You have QUALIFIED!' : '✗ You have NOT QUALIFIED.'}
              </p>
            </div>
          </div>
        </div>

        {/* Error Rules */}
        <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
          <h4 className="font-bold text-white p-4 text-center" style={{ background: rrbBlue }}>
            Error Rules (त्रुटि नियम)
          </h4>
          <div className="text-xs sm:text-sm space-y-2 p-4">
            <p className="font-semibold text-destructive">Full Mistakes (पूर्ण त्रुटियाँ):</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li><span className="text-violet-500 font-semibold">Omission (छोड़ना)</span> - For every omission of a word/figure.</li>
              <li><span className="text-red-500 font-semibold">Substitution (प्रतिस्थापन)</span> - For every wrong word/figure.</li>
              <li><span className="text-orange-500 font-semibold">Addition (जोड़ना)</span> - For every extra word not in passage.</li>
              <li><span className="text-red-500 font-semibold">Spelling Error (वर्तनी त्रुटि)</span> - For spelling mistakes.</li>
              <li><span className="text-red-500 font-semibold">Repetition (दोहराव)</span> - For word repetition.</li>
            </ol>
            <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500 rounded-lg">
              <p className="font-semibold text-blue-700 dark:text-blue-400">
                ℹ️ Note: In RRB NTPC, each error directly reduces your net word count. Net Speed = (Gross Words - Errors) ÷ Time in minutes.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-4 sm:mt-6">
          <Button onClick={onStartNewTest} className="text-sm sm:text-base" style={{ background: rrbBlue }}>
            Start New Test
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RRBNTPCResults;
