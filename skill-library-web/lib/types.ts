/**
 * Types mirroring the skill-service API contract.
 *
 * GET /api/skills              -> { total, skills: Skill[] }
 * GET /api/skills/{slug}       -> Skill
 * GET /api/skills/{slug}/download -> application/zip (binary)
 * POST /api/convert/upload     -> ConvertTask (title travels as a query param)
 * GET /api/convert/{taskId}    -> ConvertTask
 * GET /api/zlib/search?q=      -> ZlibSearchResponse
 * GET /health                  -> { status, service, version, storage, skills }
 */

export interface Skill {
  slug: string;
  /** Display title. The API calls this `name`. */
  name: string;
  description?: string;
  version?: string | null;
  author?: string | null;
  tags?: string[];
  /** Absolute path of the skill folder on the API host. */
  path?: string;
  hasZip?: boolean;
  chapters?: string[];
  chapterCount?: number;
  extras?: string[];
}

export interface SkillsResponse {
  total?: number;
  skills: Skill[];
}

export interface ConvertResult {
  slug?: string;
  title?: string;
  chapterCount?: number;
  characters?: number;
  skillPath?: string;
  zipPath?: string;
  zipName?: string;
  /** Relative API path, e.g. "/api/skills/my-book/download". */
  downloadUrl?: string;
  chapters?: { index: number; title: string }[];
}

export interface ConvertTask {
  taskId?: string;
  kind?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | string;
  /** 0.0 – 1.0 */
  progress?: number;
  message?: string;
  createdAt?: string;
  updatedAt?: string;
  result?: ConvertResult | null;
  error?: string | null;
}

export interface ZlibStep {
  step: number;
  title: string;
  detail: string;
}

export interface ZlibGuidance {
  name: string;
  summary: string;
  steps: ZlibStep[];
  queryTemplate: string;
  tips: string[];
  notes: string;
}

export interface ZlibLink {
  url: string;
  mirror: string;
  path: string;
}

export interface ZlibSearchResponse {
  query: string;
  status: 'empty' | 'ok' | string;
  scraped?: boolean;
  message?: string;
  guidance: ZlibGuidance;
  results: unknown[];
  links: ZlibLink[];
  mirrors?: string[];
  cookieConfigured?: boolean;
  cookieNote?: string;
}
