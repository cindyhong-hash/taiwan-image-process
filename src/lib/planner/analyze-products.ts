import { describeProduct } from "@/lib/fal";
import { productsNeedingImageAnalysis, type PlannerContextInput } from "@/lib/planner/planner-context";

export async function analyzePlannerProducts(campaigns: PlannerContextInput["campaigns"]): Promise<Map<string, string>> {
  const products = productsNeedingImageAnalysis(campaigns);
  const results = await Promise.all(products.map(async (product) => {
    try {
      return [product.id, (await describeProduct(product.imageUrl)) ?? ""] as const;
    } catch (error) {
      console.warn(`[planner] Product image analysis failed for ${product.id}:`, error);
      return [product.id, ""] as const;
    }
  }));
  return new Map(results.filter((entry) => entry[1]));
}
