import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function HistoryLoading() {
  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-zinc-900">
        <CardHeader>
          <Skeleton className="h-7 w-48 bg-white/20" />
          <Skeleton className="mt-2 h-4 max-w-md bg-white/10" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
            <Skeleton className="h-6 w-28 rounded-full bg-white/10" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-zinc-900">
        <CardHeader>
          <Skeleton className="h-6 w-36 bg-white/20" />
          <Skeleton className="mt-2 h-4 w-full max-w-2xl bg-white/10" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-4/5 max-w-md bg-white/10" />
          <Skeleton className="h-4 w-3/4 max-w-sm bg-white/10" />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="border-white/10 bg-zinc-800">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28 bg-white/20" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full bg-white/10" />
              <Skeleton className="h-4 w-5/6 bg-white/10" />
              <Skeleton className="h-4 w-1/3 bg-white/10" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-white/10 bg-zinc-900">
        <CardHeader>
          <Skeleton className="h-6 w-32 bg-white/20" />
          <Skeleton className="mt-2 h-4 w-full max-w-xl bg-white/10" />
        </CardHeader>
        <CardContent className="space-y-5">
          <Skeleton className="h-10 w-full max-w-xs rounded-2xl bg-white/10" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl bg-white/5" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
