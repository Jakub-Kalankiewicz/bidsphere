import { expect } from "chai";

import {
  createModelIds,
  gasRowsToCsv,
  measureGasComparison,
} from "../scripts/benchmark-gas";

describe("gas benchmark harness", () => {
  it("measures individual and Merkle registration on fresh contracts", async () => {
    const rows = await measureGasComparison([1, 2], 1, "abc123");

    expect(rows).to.have.length(2);
    expect(rows.map((row) => row.batchSize)).to.deep.equal([1, 2]);
    for (const row of rows) {
      expect(row.repetition).to.equal(1);
      expect(row.commit).to.equal("abc123");
      expect(row.modelIdLength).to.equal(24);
      expect(row.individualTotalGas).to.be.greaterThan(0n);
      expect(row.merkleBatchGas).to.be.greaterThan(0n);
      expect(row.individualGasPerModel).to.equal(
        Number(row.individualTotalGas) / row.batchSize
      );
      expect(row.merkleGasPerModel).to.equal(
        Number(row.merkleBatchGas) / row.batchSize
      );
    }
  });

  it("uses 24-character identifiers representative of MongoDB ObjectIds", () => {
    const ids = createModelIds(3);

    expect(ids).to.have.length(3);
    expect(ids.every((id) => /^[0-9a-f]{24}$/.test(id))).to.equal(true);
  });

  it("neutralizes spreadsheet formulas in gas benchmark metadata", () => {
    const csv = gasRowsToCsv([
      {
        timestamp: "2026-08-10T00:00:00.000Z",
        commit: "=1+1",
        network: "@malicious",
        batchSize: 1,
        repetition: 1,
        individualTotalGas: 100n,
        merkleBatchGas: 200n,
        individualGasPerModel: 100,
        merkleGasPerModel: 200,
        modelIdLength: 24,
      },
    ]);

    expect(csv).to.include(",'=1+1,'@malicious,");
  });
});
