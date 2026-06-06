-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 100000 CHECK ("balanceCents" >= 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "side" TEXT NOT NULL CHECK ("side" IN ('YES', 'NO')),
    "qty" INTEGER NOT NULL CHECK ("qty" > 0),
    "fillPriceCents" INTEGER NOT NULL CHECK ("fillPriceCents" BETWEEN 1 AND 99),
    "costCents" INTEGER NOT NULL CHECK ("costCents" >= 0),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Fill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "side" TEXT NOT NULL CHECK ("side" IN ('YES', 'NO')),
    "qty" INTEGER NOT NULL CHECK ("qty" >= 0),
    "avgCostCents" INTEGER NOT NULL CHECK ("avgCostCents" >= 0),
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Fill_userId_createdAt_idx" ON "Fill"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fill_userId_idempotencyKey_key" ON "Fill"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Position_userId_ticker_side_key" ON "Position"("userId", "ticker", "side");
