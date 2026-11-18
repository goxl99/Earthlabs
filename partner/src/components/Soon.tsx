export default function Soon({ title, day, note }: { title: string; day: number; note: string }) {
  return (<><h1>{title}</h1><div className="note">Scheduled for build day {day}. {note} The approved behaviour is in docs/BUILD_PLAN.md and the review prototype.</div></>);
}
