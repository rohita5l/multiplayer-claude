export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-semibold tracking-tight">Multiplayer Claude</div>
          <p className="text-sm text-muted-foreground mt-1">Live, shared Claude Code sessions with inline review.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
