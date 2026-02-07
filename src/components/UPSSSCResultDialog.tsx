import React, { useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { compareWords, ComparisonResult } from '@/utils/wordComparison';
import { calculateUPSSSCSpeed } from '@/config/examConfig';
import { 
  Keyboard, XCircle, Percent, Gauge, Target, Delete, CheckCircle, 
  XOctagon, FileText, Hash, X, Printer, AlertTriangle
} from 'lucide-react';

interface UPSSSCResultDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: any;
}

const UPSSSCResultDialog = ({ isOpen, onClose, result }: UPSSSCResultDialogProps) => {
  const printRef = useRef<HTMLDivElement>(null);

  const { data: testData } = useQuery({
    queryKey: ['test-detail-upsssc', result?.test_id],
    queryFn: async () => {
      if (!result?.test_id) return null;
      const { data, error } = await supabase
        .from('typing_tests')
        .select('content, title, language, time_limit')
        .eq('id', result.test_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!result?.test_id && isOpen
  });

  const limitedContent = useMemo(() => {
    if (!testData?.content) return '';
    const wordLimit = result?.word_limit_used || result?.total_words;
    if (wordLimit && wordLimit > 0) {
      const words = testData.content.split(' ').filter((w: string) => w.trim() !== '');
      return words.slice(0, wordLimit).join(' ');
    }
    return testData.content;
  }, [testData?.content, result?.word_limit_used, result?.total_words]);

  const comparison: ComparisonResult | null = useMemo(() => {
    if (!limitedContent || !result?.typed_text) return null;
    return compareWords(limitedContent, result.typed_text);
  }, [limitedContent, result?.typed_text]);

  if (!result) return null;

  const isHindi = (result.typing_tests?.language || 'english').toLowerCase() === 'hindi';
  const minSpeed = isHindi ? 25 : 30;
  const timeTakenSeconds = result.time_taken || 0;
  const timeTakenMinutes = timeTakenSeconds / 60;
  const testDurationSeconds = result.typing_tests?.time_limit || 300;
  const testDurationMinutes = Math.floor(testDurationSeconds / 60);

  const formatTimeTaken = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const typedKeystrokes = result.correct_keystrokes || 0;
  const totalKeystrokes = result.total_keystrokes || 0;
  const backspaceCount = result.backspace_count || 0;

  const stats = {
    totalWords: result.total_words || 0,
    correctWords: result.correct_words_count || 0,
    wrongWords: result.incorrect_words || 0,
    skippedWords: result.skipped_words || 0,
    extraWords: result.extra_words || 0,
    totalErrors: result.errors || result.incorrect_words || 0,
    accuracy: result.accuracy || 0
  };

  // UPSSSC calculations
  const upssscCalc = calculateUPSSSCSpeed(typedKeystrokes, stats.totalErrors, timeTakenMinutes, 5, 5);
  const isPassed = result.is_qualified ?? (upssscCalc.finalSpeed >= minSpeed);

  const actualTypedWords = comparison 
    ? comparison.typedComparison.filter(item => item.status !== 'skipped').length
    : result.typed_words || 0;

  // Word-based speeds
  const wordGrossSpeed = result.gross_wpm || (timeTakenMinutes > 0 ? actualTypedWords / timeTakenMinutes : 0);
  const wordNetSpeed = result.wpm || 0;

  const renderTypedText = () => {
    if (!comparison) {
      return <p className="text-sm leading-relaxed">{result.typed_text || 'No typed text available'}</p>;
    }
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

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('Please allow popups to print'); return; }

    let resultParagraphHtml = '';
    if (comparison) {
      comparison.typedComparison.forEach((item) => {
        switch (item.status) {
          case 'correct': resultParagraphHtml += `<span class="word-correct">${item.word}</span> `; break;
          case 'wrong': resultParagraphHtml += `<span class="word-wrong">${item.word}</span><span class="word-expected">{${item.expectedWord}}</span> `; break;
          case 'skipped': resultParagraphHtml += `<span class="word-skipped">${item.word}</span> `; break;
          case 'extra': resultParagraphHtml += `<span class="word-extra">${item.word}</span> `; break;
          default: resultParagraphHtml += `${item.word} `;
        }
      });
    } else {
      resultParagraphHtml = result.typed_text || 'No typed text available';
    }

    const styles = `<style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: system-ui, sans-serif; padding: 20px; line-height: 1.6; }
      .header { background: #4F46E5; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
      .header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .header-item p:first-child { font-size: 10px; opacity: 0.8; }
      .header-item p:last-child { font-weight: bold; }
      .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; }
      .stat-card { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
      .stat-card .value { font-size: 20px; font-weight: bold; }
      .stat-card .label { font-size: 10px; color: #6b7280; }
      .stat-card.qualified { background: #dcfce7; border-color: #22c55e; }
      .stat-card.not-qualified { background: #fee2e2; border-color: #ef4444; }
      .formula-box { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 15px; }
      .formula-header { background: #4F46E5; color: white; padding: 10px; text-align: center; font-weight: bold; font-size: 14px; }
      .formula-content { padding: 12px; }
      .formula-step { background: #f9fafb; padding: 8px; margin-bottom: 8px; border-radius: 6px; text-align: center; }
      .paragraph-section { margin-top: 15px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
      .paragraph-header { background: #4F46E5; color: white; padding: 10px; text-align: center; font-weight: bold; }
      .paragraph-columns { display: grid; grid-template-columns: 1fr 1fr; }
      .column-header { background: #f3f4f6; padding: 8px; text-align: center; font-weight: 600; font-style: italic; border-bottom: 1px solid #e5e7eb; }
      .column-content { padding: 12px; font-size: 12px; line-height: 1.8; text-align: justify; }
      .column-left { border-right: 1px solid #e5e7eb; }
      .word-correct { color: inherit; } .word-wrong { color: #dc2626; font-weight: 600; }
      .word-expected { color: #16a34a; font-weight: 600; } .word-skipped { color: #8b5cf6; font-weight: 600; }
      .word-extra { color: #f97316; text-decoration: line-through; font-weight: 600; }
      .legend { display: flex; gap: 12px; justify-content: center; padding: 10px; background: #f3f4f6; font-size: 10px; border-top: 1px solid #e5e7eb; }
      .footer { margin-top: 15px; text-align: center; font-size: 10px; color: #9ca3af; }
      @media print { body { padding: 10px; } }
    </style>`;

    const excessErrors = Math.max(0, stats.totalErrors - 5);

    printWindow.document.write(`<!DOCTYPE html><html><head><title>UPSSSC Junior Assistant Result</title>${styles}</head><body>
      <div class="header">
        <div class="header-grid">
          <div class="header-item"><p>Exam Title</p><p>UPSSSC Junior Assistant ${result.typing_tests?.language || 'English'} Typing</p></div>
          <div class="header-item"><p>Total Words Given</p><p>${stats.totalWords}</p></div>
          <div class="header-item"><p>Typing Date</p><p>${new Date(result.completed_at).toLocaleDateString('en-IN')}</p></div>
        </div>
        <div class="header-grid" style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.2);">
          <div class="header-item"><p>Passage Title</p><p>${result.typing_tests?.title || 'Unknown'}</p></div>
          <div class="header-item"><p>Time Duration</p><p>${testDurationMinutes}:00 min.</p></div>
          <div class="header-item"><p>Time Taken</p><p>${formatTimeTaken(timeTakenSeconds)} min.</p></div>
        </div>
      </div>

      <div class="formula-box">
        <div class="formula-header">UPSSSC Speed Calculation (5 Keystrokes = 1 Word)</div>
        <div class="formula-content">
          <div class="formula-step"><strong>Keystrokes:</strong> ${typedKeystrokes} ÷ 5 = <strong>${upssscCalc.grossWords.toFixed(1)} words</strong></div>
          <div class="formula-step"><strong>Errors:</strong> ${stats.totalErrors} (Admissible: 5, Excess: ${excessErrors}) → Penalty: ${upssscCalc.penalty}</div>
          <div class="formula-step"><strong>Net Words:</strong> ${upssscCalc.grossWords.toFixed(1)} - ${upssscCalc.penalty} = <strong>${upssscCalc.netCorrectWords.toFixed(1)}</strong></div>
          <div class="formula-step"><strong>Final Speed:</strong> ${upssscCalc.netCorrectWords.toFixed(1)} ÷ ${timeTakenMinutes.toFixed(2)} = <strong style="color:${isPassed ? '#16a34a' : '#dc2626'}">${upssscCalc.finalSpeed.toFixed(2)} WPM</strong></div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="value">${actualTypedWords}</div><div class="label">Words Typed</div></div>
        <div class="stat-card"><div class="value" style="color:#dc2626;">${stats.totalErrors}</div><div class="label">Total Errors</div></div>
        <div class="stat-card"><div class="value" style="color:#4F46E5;">${stats.accuracy}%</div><div class="label">Accuracy</div></div>
        <div class="stat-card ${isPassed ? 'qualified' : 'not-qualified'}">
          <div class="value" style="color:${isPassed ? '#16a34a' : '#dc2626'};">${isPassed ? 'Qualified' : 'Not Qualified'}</div>
          <div class="label">Status (min ${minSpeed} WPM)</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="value">${Number(wordGrossSpeed).toFixed(2)}</div><div class="label">Gross Speed (Word)</div></div>
        <div class="stat-card"><div class="value">${Number(wordNetSpeed).toFixed(2)}</div><div class="label">Net Speed (Word)</div></div>
        <div class="stat-card"><div class="value">${backspaceCount}</div><div class="label">Backspace Count</div></div>
        <div class="stat-card"><div class="value">${typedKeystrokes}</div><div class="label">Typed Keystrokes</div></div>
      </div>

      ${limitedContent ? `
        <div class="paragraph-section">
          <div class="paragraph-header">Paragraph Comparison</div>
          <div class="paragraph-columns"><div class="column-header column-left">Question Paragraph</div><div class="column-header">Result Paragraph</div></div>
          <div class="paragraph-columns"><div class="column-content column-left">${limitedContent}</div><div class="column-content">${resultParagraphHtml}</div></div>
          <div class="legend">
            <span><span class="word-wrong">Red</span> = Wrong</span>
            <span><span class="word-expected">{Green}</span> = Correct</span>
            <span><span class="word-skipped">Violet</span> = Skipped</span>
            <span><span class="word-extra">Orange</span> = Extra</span>
          </div>
        </div>` : ''}

      <div class="footer"><p>Generated from TypeScribe Zen | ${new Date().toLocaleString()}</p></div>
    </body></html>`);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden p-0">
        <DialogHeader className="p-4 pb-0 flex flex-row items-center justify-between">
          <DialogTitle className="text-lg flex items-center gap-2">
            UPSSSC Junior Assistant Result
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <ScrollArea className="h-[calc(95vh-80px)]">
          <div ref={printRef} className="p-4 space-y-4">
            {/* Header */}
            <div className="bg-primary text-primary-foreground rounded-xl p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-primary-foreground/70">Exam Title</p>
                  <p className="font-bold">UPSSSC Junior Assistant {result.typing_tests?.language || 'English'} Typing</p>
                </div>
                <div>
                  <p className="text-xs text-primary-foreground/70">Total Words Given</p>
                  <p className="font-bold">{stats.totalWords}</p>
                </div>
                <div>
                  <p className="text-xs text-primary-foreground/70">Typing Date</p>
                  <p className="font-bold">{new Date(result.completed_at).toLocaleDateString('en-IN')}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-primary-foreground/20">
                <div>
                  <p className="text-xs text-primary-foreground/70">Passage Title</p>
                  <p className="font-semibold">{result.typing_tests?.title || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-xs text-primary-foreground/70">Time Duration</p>
                  <p className="font-semibold">{testDurationMinutes}:00 min.</p>
                </div>
                <div>
                  <p className="text-xs text-primary-foreground/70">Time Taken</p>
                  <p className="font-semibold">{formatTimeTaken(timeTakenSeconds)} min.</p>
                </div>
              </div>
            </div>

            {/* UPSSSC Speed Calculation */}
            <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
              <h4 className="font-bold text-primary-foreground p-4 text-center bg-primary">
                UPSSSC Speed Calculation (5 Keystrokes = 1 Word)
              </h4>
              <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="text-center p-3 bg-background rounded-lg border">
                  <p className="text-2xl font-bold text-primary">{typedKeystrokes}</p>
                  <p className="text-xs text-muted-foreground">Total Keystrokes</p>
                </div>
                <div className="text-center p-3 bg-background rounded-lg border">
                  <p className="text-2xl font-bold">{upssscCalc.grossWords.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Gross Words (÷5)</p>
                </div>
                <div className="text-center p-3 bg-background rounded-lg border">
                  <p className="text-2xl font-bold text-destructive">{upssscCalc.penalty}</p>
                  <p className="text-xs text-muted-foreground">Penalty</p>
                </div>
                <div className="text-center p-3 bg-background rounded-lg border">
                  <p className="text-2xl font-bold text-green-600">{upssscCalc.netCorrectWords.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Net Words</p>
                </div>
                <div className="text-center p-3 bg-background rounded-lg border">
                  <p className={`text-2xl font-bold ${isPassed ? 'text-green-600' : 'text-destructive'}`}>
                    {upssscCalc.finalSpeed.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">Final Speed (WPM)</p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Words Typed" value={actualTypedWords} icon={Keyboard} />
              <StatCard label="Total Errors" value={stats.totalErrors} icon={XCircle} valueColor="text-destructive" />
              <StatCard label="Admissible (5)" value={Math.min(stats.totalErrors, 5)} icon={AlertTriangle} valueColor="text-amber-500" />
              <StatCard label="Excess Errors" value={Math.max(0, stats.totalErrors - 5)} icon={XOctagon} valueColor="text-red-500" />
              <StatCard label="Accuracy %" value={`${stats.accuracy}`} icon={Percent} valueColor="text-primary" />
              <StatCard label="Backspace" value={backspaceCount} icon={Delete} />
              <StatCard label="Word Gross Speed" value={Number(wordGrossSpeed).toFixed(2)} icon={Gauge} valueColor="text-blue-600" />
              <div className={`border rounded-xl p-4 flex items-center justify-between gap-3 ${isPassed ? 'bg-green-500/10 border-green-500' : 'bg-destructive/10 border-destructive'}`}>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className={`text-xl font-bold ${isPassed ? 'text-green-600' : 'text-destructive'}`}>
                    {isPassed ? 'Qualified' : 'Not Qualified'}
                  </p>
                </div>
                {isPassed ? <CheckCircle className="h-8 w-8 text-green-600" /> : <Target className="h-8 w-8 text-destructive" />}
              </div>
            </div>

            {/* Additional stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Correct Words" value={stats.correctWords} icon={CheckCircle} valueColor="text-green-600" />
              <StatCard label="Wrong Words" value={stats.wrongWords} icon={XOctagon} valueColor="text-red-500" />
              <StatCard label="Skipped" value={stats.skippedWords} icon={Hash} valueColor="text-violet-500" />
              <StatCard label="Extra" value={stats.extraWords} icon={Hash} valueColor="text-orange-500" />
              <StatCard label="Passage Keystrokes" value={totalKeystrokes} icon={FileText} />
            </div>

            {/* Paragraph Comparison */}
            {limitedContent && (
              <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
                <h4 className="font-bold text-primary-foreground p-4 text-center bg-primary">Paragraph Comparison</h4>
                <div className="grid grid-cols-2 bg-secondary border-b border-border">
                  <div className="p-3 text-center font-bold border-r border-border italic">Question Paragraph</div>
                  <div className="p-3 text-center font-bold italic">Result Paragraph</div>
                </div>
                <div className="grid grid-cols-2">
                  <div className="p-4 border-r border-border bg-background max-h-96 overflow-y-auto">
                    <div className="text-sm leading-loose text-justify">{limitedContent}</div>
                  </div>
                  <div className="p-4 bg-background max-h-96 overflow-y-auto">
                    <div className="text-sm leading-loose text-justify">{renderTypedText()}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 justify-center text-xs p-3 bg-secondary border-t border-border">
                  <span><span className="text-red-500 font-semibold">Red</span> = Wrong</span>
                  <span><span className="text-green-500 font-semibold">{'{Green}'}</span> = Correct</span>
                  <span><span className="text-violet-500 font-semibold">Violet</span> = Skipped</span>
                  <span><span className="text-orange-500 line-through">Orange</span> = Extra</span>
                </div>
              </div>
            )}

            {/* Speed Formula */}
            <div className="bg-secondary/50 border border-border rounded-xl overflow-hidden">
              <h4 className="font-bold text-primary-foreground p-4 text-center bg-primary">Speed Calculation Formula</h4>
              <div className="text-center text-sm p-4 space-y-2">
                <p>Keystrokes: {typedKeystrokes} ÷ 5 = {upssscCalc.grossWords.toFixed(1)} words</p>
                <p>Errors: {stats.totalErrors} | Admissible: 5 | Excess: {Math.max(0, stats.totalErrors - 5)} → Penalty: {upssscCalc.penalty}</p>
                <p>Net Words: {upssscCalc.grossWords.toFixed(1)} - {upssscCalc.penalty} = {upssscCalc.netCorrectWords.toFixed(1)}</p>
                <p className="text-primary font-bold">
                  Speed = {upssscCalc.netCorrectWords.toFixed(1)} ÷ {timeTakenMinutes.toFixed(2)} = {upssscCalc.finalSpeed.toFixed(2)} WPM
                </p>
              </div>
            </div>

            {/* Qualification */}
            <div className={`p-4 rounded-xl text-center ${isPassed ? 'bg-green-500/10 border border-green-500' : 'bg-destructive/10 border border-destructive'}`}>
              <p className="font-bold">Speed: {upssscCalc.finalSpeed.toFixed(2)} WPM | Required: {minSpeed} WPM</p>
              <p className={`font-bold mt-1 ${isPassed ? 'text-green-600' : 'text-destructive'}`}>
                {isPassed ? '✓ QUALIFIED' : '✗ NOT QUALIFIED'}
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default UPSSSCResultDialog;
