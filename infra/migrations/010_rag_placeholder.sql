-- FILE: infra/migrations/010_rag_placeholder.sql
-- PLAN: IMPLEMENTATION_PLAN.md 5.10, 13
-- STATUS: COMPLETE - do not modify
--
-- Tables only. DO NOT ingest documents, create the ANN index, install an LLM
-- SDK, or write prompts in v1. The RAG specification arrives separately.
--
-- Provenance columns are mandatory rather than optional: an answer from this
-- corpus must be traceable to an approved source, or it should not be given.

CREATE TABLE guideline_documents (
  document_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  publisher     text NOT NULL,        -- e.g. MoHFW / WHO / state NHM
  version_label text NOT NULL,
  language      text NOT NULL DEFAULT 'en',
  source_url    text,
  approved_by   text,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE guideline_chunks (
  chunk_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES guideline_documents(document_id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,
  heading     text,
  content     text NOT NULL,
  page_ref    text,                   -- becomes the citation shown in the UI
  token_count integer,
  -- DECIDE: dimension must match the chosen embedding model. 768 is a
  -- placeholder. Confirm before ingesting anything.
  embedding   vector(768),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, ordinal)
);

-- ANN index intentionally NOT created: build it after ingestion, when the row
-- count is known and hnsw vs ivfflat can be chosen on evidence.
