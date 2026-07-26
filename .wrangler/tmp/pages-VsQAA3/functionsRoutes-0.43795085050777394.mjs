import { onRequestGet as __api_revalidate_ts_onRequestGet } from "C:\\Users\\2210089\\jamstack_rebuild_vs_revalidate\\functions\\api\\revalidate.ts"
import { onRequestPost as __api_revalidate_ts_onRequestPost } from "C:\\Users\\2210089\\jamstack_rebuild_vs_revalidate\\functions\\api\\revalidate.ts"

export const routes = [
    {
      routePath: "/api/revalidate",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_revalidate_ts_onRequestGet],
    },
  {
      routePath: "/api/revalidate",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_revalidate_ts_onRequestPost],
    },
  ]