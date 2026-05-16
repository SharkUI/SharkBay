import type { InstallRecipe } from "../shared/types.js";

export class InstallRecipeRegistry {
  private readonly recipes = new Map<string, InstallRecipe>();

  constructor(recipes: InstallRecipe[] = []) {
    for (const recipe of recipes) {
      this.register(recipe);
    }
  }

  register(recipe: InstallRecipe): void {
    this.recipes.set(recipe.id, recipe);
  }

  get(recipeId: string): InstallRecipe | null {
    return this.recipes.get(recipeId) ?? null;
  }

  list(): InstallRecipe[] {
    return [...this.recipes.values()];
  }

  listForTool(toolId: string): InstallRecipe[] {
    return this.list().filter((recipe) => recipe.toolId === toolId);
  }
}
