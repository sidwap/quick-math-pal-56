import { Calculator } from "@/components/Calculator";

const Index = () => {
  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--gradient-warm)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-4xl font-bold text-foreground tracking-tight">Calculator</h1>
          <p className="text-muted-foreground">Simple & elegant calculations</p>
        </div>
        <Calculator />
      </div>
    </main>
  );
};

export default Index;
