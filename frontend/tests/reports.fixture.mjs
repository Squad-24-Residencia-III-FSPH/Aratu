export const report = { key: 'fleet-fuelings', module: 'FROTA', title: 'Abastecimentos por período', description: 'Abastecimentos fictícios.',
  period: { required: true, label: 'Data do abastecimento', maxDays: 366 },
  filters: [{ key: 'fuelType', label: 'Combustível', type: 'select', options: [{ value: 'DIESEL', label: 'Diesel' }] }],
  columns: [
    { key: 'licensePlate', label: 'Placa', type: 'text', defaultSelected: true },
    { key: 'liters', label: 'Litros', type: 'number', defaultSelected: true, totalizable: true },
    { key: 'totalValue', label: 'Valor total', type: 'currency', defaultSelected: true, totalizable: true },
  ] }
export const catalog = [{ module: 'FROTA', reports: [report] }]
export const preview = { reportKey: report.key, title: report.title, module: report.module, period: { from: '2026-11-01', to: '2026-11-15' },
  columns: report.columns, rows: [{ licensePlate: 'QAF1A32', liters: '12.500', totalValue: '75.00' }], page: 1, pageSize: 50, totalCount: 1, totalPages: 1,
  totals: { liters: '12.500', totalValue: '75.00' } }
export const selection = { from: '2026-11-01', to: '2026-11-15', columns: ['licensePlate', 'liters'], filters: { fuelType: 'DIESEL' } }
