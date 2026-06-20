export function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/80">
      <div className="border border-dashed border-border px-10 py-6 text-sm font-semibold text-foreground">
        Drop to add
      </div>
    </div>
  );
}
