import { format, parseISO } from 'date-fns';

interface Event {
  date: string;
  headline: string;
  description: string;
}

export function Events({ events }: { events: Event[] }) {
  return (
    <div className="-mt-2 flex flex-col gap-2 overflow-scroll py-4 sm:flex-row">
      {events.map((event) => (
        <div
          key={event.date}
          className="bg-zinc-900 flex max-w-96 flex-shrink-0 flex-col rounded-md p-4"
        >
          <div className="text-zinc-400 text-sm">
            {format(parseISO(event.date), 'dd LLL, yyyy')}
          </div>
          <div className="text-zinc-200 text-base font-bold">
            {event.headline.slice(0, 30)}
          </div>
          <div className="text-zinc-500">
            {event.description.slice(0, 70)}...
          </div>
        </div>
      ))}
    </div>
  );
}
