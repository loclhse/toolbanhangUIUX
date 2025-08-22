export type TableApiResponse = {
  success: boolean;
  message: string;
  data: TableFromApi[];
};

export type TableFromApi = {
  id: string;
  number: number;
}; 