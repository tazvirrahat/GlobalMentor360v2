import type { Metadata, Route } from "next";
import Link from "next/link";
import { getSite } from "@/lib/site";

export const metadata: Metadata = {
  title: "Help",
  description: "Answers about buying a course, paying with bKash, learning, certificates and your account.",
};

type Topic = { question: string; answer: React.ReactNode };

const INLINE = "font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring rounded-sm";

function Section({ id, title, topics }: { id: string; title: string; topics: Topic[] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 border-t border-rule pt-8">
      <h2 id={id} className="text-2xl font-semibold">
        {title}
      </h2>
      <div className="flex flex-col gap-6">
        {topics.map((topic) => (
          <div key={topic.question} className="flex flex-col gap-1.5">
            <h3 className="text-lg font-semibold">{topic.question}</h3>
            <div className="text-base text-ink/90">{topic.answer}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Help lives in the same place on every page: the footer and the account menu
 * (WCAG 3.2.6). Answers describe how the product actually behaves; nothing here
 * promises a timeline or a policy the product does not enforce.
 */
export default function HelpPage() {
  const site = getSite();

  const buying: Topic[] = [
    {
      question: "How do I pay with bKash?",
      answer: (
        <p>
          Open the course and choose <strong>Buy course</strong>. Send the amount shown with bKash, following the
          instructions on the checkout page, then enter the transaction ID from your bKash confirmation message. We check the payment
          and open the course for you. You get a notification when it is confirmed, and the receipt stays under{" "}
          <Link href="/orders" className={INLINE}>
            Orders
          </Link>
          .
        </p>
      ),
    },
    {
      question: "Can I pay by card?",
      answer: (
        <p>
          Where card payment is offered you will see it at checkout. You pay on a secure Stripe page and the course
          opens as soon as the payment goes through.
        </p>
      ),
    },
    {
      question: "I have a coupon code",
      answer: <p>Enter it in your cart or at checkout before you pay. The new total is shown before you send any money.</p>,
    },
    {
      question: "Can I buy several courses at once?",
      answer: (
        <p>
          Yes. Add them to your{" "}
          <Link href={"/cart" as Route} className={INLINE}>
            cart
          </Link>{" "}
          and pay for all of them in one bKash transaction.
        </p>
      ),
    },
  ];

  const learning: Topic[] = [
    {
      question: "Where are my courses?",
      answer: (
        <p>
          In{" "}
          <Link href="/dashboard" className={INLINE}>
            My learning
          </Link>
          . Resume opens the lesson where you stopped.
        </p>
      ),
    },
    {
      question: "Why is a lesson locked?",
      answer: (
        <p>
          Lessons open in order. Finish the lesson before it, and pass the short quiz at the end of a section to open
          the next section. Your place is saved on every device.
        </p>
      ),
    },
    {
      question: "Can I try a course before buying it?",
      answer: <p>Many courses have free preview lessons. They are marked on the course page and play without an account.</p>,
    },
    {
      question: "I have a question about a lesson",
      answer: <p>Ask it in the lesson&rsquo;s Q&amp;A. The instructor and other learners on the course can answer there.</p>,
    },
  ];

  const certificates: Topic[] = [
    {
      question: "How do I get a certificate?",
      answer: (
        <p>
          Finish every lesson and pass every quiz in the course. Your certificate is issued straight away and appears
          in My learning under Completed.
        </p>
      ),
    },
    {
      question: "How can an employer check my certificate?",
      answer: (
        <p>
          Share the certificate&rsquo;s link or its number. Anyone can open{" "}
          <Link href={"/certificates" as Route} className={INLINE}>
            Verify a certificate
          </Link>{" "}
          and enter the number to see your name, the course and the date you finished. You can also download it as a
          PDF.
        </p>
      ),
    },
  ];

  const account: Topic[] = [
    {
      question: "I forgot my password",
      answer: (
        <p>
          Use{" "}
          <Link href="/forgot-password" className={INLINE}>
            Forgot password
          </Link>{" "}
          on the sign-in page. We email you a link to choose a new one.
        </p>
      ),
    },
    {
      question: "How do I change my name or password, or sign out other devices?",
      answer: (
        <p>
          All three are in{" "}
          <Link href="/account" className={INLINE}>
            Account
          </Link>
          . Your certificates show the name on your account, so keep it the way you want an employer to read it.
        </p>
      ),
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">Help</h1>
        <p className="text-lg text-graphite">
          Answers about buying a course, learning, certificates and your {site.name} account.
        </p>
      </div>

      <Section id="buying" title="Buying a course" topics={buying} />
      <Section id="learning" title="Learning" topics={learning} />
      <Section id="certificates" title="Certificates" topics={certificates} />
      <Section id="account" title="Your account" topics={account} />

      <section aria-labelledby="contact" className="flex flex-col gap-3 border-t border-rule pt-8">
        <h2 id="contact" className="text-2xl font-semibold">
          Still need help?
        </h2>
        {site.supportEmail ? (
          <p>
            Email{" "}
            <a href={`mailto:${site.supportEmail}`} className={INLINE}>
              {site.supportEmail}
            </a>
            . If it is about a payment, include the order number from Orders.
          </p>
        ) : (
          <p>
            For anything about a course, ask in the lesson&rsquo;s Q&amp;A, where the instructor answers. For a
            payment, open the order under Orders: it shows the payment&rsquo;s status and reference.
          </p>
        )}
      </section>
    </main>
  );
}
