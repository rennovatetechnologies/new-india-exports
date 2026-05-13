import Hero from "@/components/Hero";
import AboutUsSection from "@/components/Aboutus";
import WorkflowSection from "@/components/WorkflowSection";
import WhyChooseUs from "@/components/WhyChooseUs";
import PlansSection from "@/components/PlansSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import ProductsSection from "@/components/ProductsSection";

export default function Home() {
  return (
    <>
      <Hero />
      <AboutUsSection />
      <WorkflowSection />
      <WhyChooseUs />
      <PlansSection />
      <ProductsSection />
      <TestimonialsSection />
    </>
  );
}
