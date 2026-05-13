import AboutShowcase from "@/components/AboutShowcase";
import AboutUsSection from "@/components/Aboutus";
import Hero from "@/components/Hero";
import PlansSection from "@/components/PlansSection";
import ProductsSection from "@/components/ProductsSection";
import AchievementsSummits from "@/components/AchievementsSummits";


export default function Home() {
  return (
    <>
      <Hero/>
      <AboutUsSection/>
      <AboutShowcase/>
      <AchievementsSummits/>
      <PlansSection/>
      <ProductsSection/>
    </>
  );
}
