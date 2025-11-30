import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Operator = "+" | "-" | "×" | "÷" | null;

export const Calculator = () => {
  const [display, setDisplay] = useState("0");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  const handleNumber = (num: string) => {
    if (waitingForOperand) {
      setDisplay(num);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === "0" ? num : display + num);
    }
  };

  const handleDecimal = () => {
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
    } else if (display.indexOf(".") === -1) {
      setDisplay(display + ".");
    }
  };

  const handleOperator = (nextOperator: Operator) => {
    const inputValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(inputValue);
    } else if (operator) {
      const currentValue = previousValue || 0;
      const newValue = calculate(currentValue, inputValue, operator);
      setDisplay(String(newValue));
      setPreviousValue(newValue);
    }

    setWaitingForOperand(true);
    setOperator(nextOperator);
  };

  const calculate = (prev: number, current: number, op: Operator): number => {
    switch (op) {
      case "+":
        return prev + current;
      case "-":
        return prev - current;
      case "×":
        return prev * current;
      case "÷":
        return prev / current;
      default:
        return current;
    }
  };

  const handleEquals = () => {
    const inputValue = parseFloat(display);

    if (operator && previousValue !== null) {
      const newValue = calculate(previousValue, inputValue, operator);
      setDisplay(String(newValue));
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  };

  const handleClear = () => {
    setDisplay("0");
    setPreviousValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  };

  const handlePercentage = () => {
    const value = parseFloat(display);
    setDisplay(String(value / 100));
  };

  const handleToggleSign = () => {
    const value = parseFloat(display);
    setDisplay(String(value * -1));
  };

  return (
    <Card className="w-full max-w-sm mx-auto bg-card border-0 overflow-hidden" style={{ boxShadow: "var(--shadow-elevated)" }}>
      <div className="p-6 space-y-6">
        {/* Display */}
        <div className="bg-calc-display rounded-2xl p-6 min-h-[120px] flex items-end justify-end">
          <div className="text-calc-display-text text-5xl font-bold tracking-tight break-all text-right">
            {display}
          </div>
        </div>

        {/* Buttons Grid */}
        <div className="grid grid-cols-4 gap-3">
          {/* Row 1 */}
          <Button
            onClick={handleClear}
            className="h-16 text-xl font-semibold bg-calc-special hover:bg-calc-special/80 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            AC
          </Button>
          <Button
            onClick={handleToggleSign}
            className="h-16 text-xl font-semibold bg-calc-special hover:bg-calc-special/80 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            ±
          </Button>
          <Button
            onClick={handlePercentage}
            className="h-16 text-xl font-semibold bg-calc-special hover:bg-calc-special/80 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            %
          </Button>
          <Button
            onClick={() => handleOperator("÷")}
            className="h-16 text-2xl font-semibold bg-calc-operator hover:bg-calc-operator-hover text-primary-foreground rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            ÷
          </Button>

          {/* Row 2 */}
          <Button
            onClick={() => handleNumber("7")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            7
          </Button>
          <Button
            onClick={() => handleNumber("8")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            8
          </Button>
          <Button
            onClick={() => handleNumber("9")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            9
          </Button>
          <Button
            onClick={() => handleOperator("×")}
            className="h-16 text-2xl font-semibold bg-calc-operator hover:bg-calc-operator-hover text-primary-foreground rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            ×
          </Button>

          {/* Row 3 */}
          <Button
            onClick={() => handleNumber("4")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            4
          </Button>
          <Button
            onClick={() => handleNumber("5")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            5
          </Button>
          <Button
            onClick={() => handleNumber("6")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            6
          </Button>
          <Button
            onClick={() => handleOperator("-")}
            className="h-16 text-2xl font-semibold bg-calc-operator hover:bg-calc-operator-hover text-primary-foreground rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            −
          </Button>

          {/* Row 4 */}
          <Button
            onClick={() => handleNumber("1")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            1
          </Button>
          <Button
            onClick={() => handleNumber("2")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            2
          </Button>
          <Button
            onClick={() => handleNumber("3")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            3
          </Button>
          <Button
            onClick={() => handleOperator("+")}
            className="h-16 text-2xl font-semibold bg-calc-operator hover:bg-calc-operator-hover text-primary-foreground rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            +
          </Button>

          {/* Row 5 */}
          <Button
            onClick={() => handleNumber("0")}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl col-span-2 transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            0
          </Button>
          <Button
            onClick={handleDecimal}
            className="h-16 text-2xl font-semibold bg-calc-number hover:bg-calc-number/90 text-calc-number-text rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            .
          </Button>
          <Button
            onClick={handleEquals}
            className="h-16 text-2xl font-semibold bg-calc-operator hover:bg-calc-operator-hover text-primary-foreground rounded-2xl transition-all hover:scale-105 active:scale-95"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            =
          </Button>
        </div>
      </div>
    </Card>
  );
};
