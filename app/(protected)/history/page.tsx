import React from "react";
import CardWrapper from "../_components/Card";
import { Table } from "../_components/Table/Table";

const HistoryPage = () => {
  return (
    <CardWrapper headerLabel="History">
      <Table />
    </CardWrapper>
  );
};

export default HistoryPage;
