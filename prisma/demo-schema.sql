-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "cancelledAt" DATETIME,
    "pickupLabel" TEXT NOT NULL,
    "pickupLat" REAL NOT NULL,
    "pickupLng" REAL NOT NULL,
    "dropoffLabel" TEXT NOT NULL,
    "dropoffLat" REAL NOT NULL,
    "dropoffLng" REAL NOT NULL,
    "fareAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SGD',
    "cancellationFeeCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseCode" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "summary" TEXT NOT NULL,
    CONSTRAINT "Dispute_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "authorAlias" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Statement_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refGroup" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "hash" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "payload" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "Evidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentFinding_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "rules" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "sufficiencyState" TEXT NOT NULL,
    "refundCents" INTEGER NOT NULL DEFAULT 0,
    "rationale" TEXT NOT NULL,
    "citations" TEXT NOT NULL,
    "evidenceSnapshot" TEXT NOT NULL,
    "approvalState" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "supersededById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recommendation_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_caseCode_key" ON "Trip"("caseCode");

-- CreateIndex
CREATE INDEX "Trip_caseCode_idx" ON "Trip"("caseCode");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_caseCode_key" ON "Dispute"("caseCode");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_tripId_key" ON "Dispute"("tripId");

-- CreateIndex
CREATE INDEX "Dispute_caseCode_idx" ON "Dispute"("caseCode");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Statement_disputeId_role_idx" ON "Statement"("disputeId", "role");

-- CreateIndex
CREATE INDEX "Evidence_disputeId_type_idx" ON "Evidence"("disputeId", "type");

-- CreateIndex
CREATE INDEX "Evidence_disputeId_refGroup_idx" ON "Evidence"("disputeId", "refGroup");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_disputeId_refGroup_version_key" ON "Evidence"("disputeId", "refGroup", "version");

-- CreateIndex
CREATE INDEX "AgentFinding_disputeId_agent_idx" ON "AgentFinding"("disputeId", "agent");

-- CreateIndex
CREATE INDEX "PolicyVersion_code_effectiveFrom_idx" ON "PolicyVersion"("code", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_code_version_key" ON "PolicyVersion"("code", "version");

-- CreateIndex
CREATE INDEX "Recommendation_disputeId_createdAt_idx" ON "Recommendation"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "Recommendation_disputeId_supersededById_idx" ON "Recommendation"("disputeId", "supersededById");

-- CreateIndex
CREATE INDEX "Recommendation_outcome_idx" ON "Recommendation"("outcome");

-- CreateIndex
CREATE INDEX "AuditEvent_disputeId_createdAt_idx" ON "AuditEvent"("disputeId", "createdAt");
