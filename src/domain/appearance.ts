import { z } from "zod";
export const themeSchema = z.enum([
  "modern",
  "vintage",
  "art",
  "natura",
  "ocean",
]);
export type Theme = z.infer<typeof themeSchema>;
export const DEFAULT_THEME: Theme = "natura";
export const themes: {
  id: Theme;
  name: string;
  description: string;
  colors: string[];
}[] = [
  {
    id: "modern",
    name: "Modern",
    description: "Gọn gàng, sắc xanh hiện đại",
    colors: ["#edf3fb", "#ffffff", "#2858a0"],
  },
  {
    id: "vintage",
    name: "Vintage",
    description: "Giấy kem, mực nâu ấm",
    colors: ["#f5eee1", "#fffcf5", "#805332"],
  },
  {
    id: "art",
    name: "Art",
    description: "Tím mận và sắc hồng sáng tạo",
    colors: ["#faf0f6", "#fffcff", "#854078"],
  },
  {
    id: "natura",
    name: "Natura",
    description: "Xanh lá dịu, gần thiên nhiên",
    colors: ["#f7f8f3", "#ffffff", "#296447"],
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Xanh biển trong, nhẹ nhàng",
    colors: ["#edf7f8", "#ffffff", "#176676"],
  },
];
export const appearanceInputSchema = z.object({ theme: themeSchema }).strict();
export const appearanceSchema = appearanceInputSchema.extend({
  schemaVersion: z.literal(1),
});
