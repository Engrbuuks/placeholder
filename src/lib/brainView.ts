// Converts a stored brand brain into the plain text values the form shows.
import { faqLines, serviceLines, type BrandBrain } from "./brandBrain";
import type { BrainFormValues } from "@/components/BrainForm";

export function brainFormValues(brain: BrandBrain): BrainFormValues {
  return {
    businessName: brain.businessName,
    summary: brain.summary,
    phone: brain.phone,
    whatsapp: brain.whatsapp,
    email: brain.email,
    address: brain.address,
    hours: brain.hours,
    services: serviceLines(brain.services),
    faqs: faqLines(brain.faqs),
    tone: brain.tone,
    answers: brain.answers,
  };
}
