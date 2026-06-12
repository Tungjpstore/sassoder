import { ChevronDown } from "lucide-react";
import { Container, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { Reveal } from "@/components/ui-v2/reveal";
import { faqs } from "../data";

export function FAQ() {
  return (
    <Section spacing="lg" id="faq" className="bg-[var(--surface-2)]/72 backdrop-blur-[2px]">
      <Container className="grid gap-[var(--s-12)] lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeader
          eyebrow="Câu hỏi thường gặp"
          title="Những điểm cần rõ trước khi bắt đầu"
        />

        <ul className="flex flex-col gap-[var(--s-3)]">
          {faqs.map((item) => (
            <Reveal as="li" key={item.q} className="overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)]">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-[var(--s-6)] py-[var(--s-4)] text-[length:var(--fs-body)] font-semibold text-[var(--text)]">
                  {item.q}
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[var(--line)] text-[var(--text-muted)] transition group-open:rotate-180 group-open:border-[var(--jade)] group-open:text-[var(--jade)]">
                    <ChevronDown size={15} />
                  </span>
                </summary>
                <p className="border-t border-[var(--line)] px-[var(--s-6)] py-[var(--s-4)] text-[length:var(--fs-sm)] leading-[var(--lh-body)] text-[var(--text-muted)]">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
