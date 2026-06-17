import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@foglamp/ui/components/avatar";

// PLACEHOLDER — do NOT ship as a real endorsement. The visible attribution is
// intentionally a fill-in-the-blank so this can't be mistaken for a genuine
// customer quote if it reaches production. Swap for a real, attributable quote
// (Marc Lou #29: "collect proof before traffic") before launch.
const TESTIMONIAL = {
  quote:
    "Caught a 10× cost regression 3 days after shipping. Foglamp paid for itself in week one.",
  author: "Gustavo Fior",
  role: "Co-founder @ Foglamp",
};

export function SocialProof() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 px-5 text-center sm:px-8 mb-20">
      <figure className="flex max-w-3xl flex-col items-center gap-5">
        <blockquote className="font-display text-3xl font-medium tracking-tight text-balance text-foreground sm:text-4xl">
          <span className="text-muted-foreground">“</span>
          {TESTIMONIAL.quote}
          <span className="text-muted-foreground">”</span>
        </blockquote>
        <figcaption className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Avatar className="size-5">
              <AvatarImage src="/avatar.jpg" alt="Gustavo" />
              <AvatarFallback>G</AvatarFallback>
            </Avatar>
            <span className="font-medium text-foreground whitespace-nowrap">
              {TESTIMONIAL.author}
            </span>
          </span>
          <span className="text-pretty">
            · {TESTIMONIAL.role}{" "}
            <span className="text-muted-foreground/50">yes, it's me :)</span>
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
