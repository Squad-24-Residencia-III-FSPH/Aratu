import { createPortal } from 'react-dom'
import type { ReportPrintData } from '../../reports/reportTypes'
import { formatReportCell } from '../../reports/reportPresentation'
import styles from '../ReportsPage.module.css'

/** Resultado completo autorizado para impressão, separado dos controles e da prévia paginada. */
export default function ReportPrintView({ data }: { data: ReportPrintData }) {
  return createPortal(<article className={styles.printRoot}>
    <header><strong>Fundação de Saúde Parreiras Horta — FSPH / SVO</strong><h1>{data.title}</h1>
      <p>Período: {data.period.from ? `${data.period.from.split('-').reverse().join('/')} a ${data.period.to?.split('-').reverse().join('/')}` : 'Todos os registros'}</p>
      {data.appliedFilters.map(filter => <p key={filter.label}>{filter.label}: {filter.value}</p>)}
      <p>Gerado por {data.generatedBy.name} em {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.generatedAt))}</p>
      <p>{data.totalCount} registros</p>
    </header>
    <table><caption>{data.title} — resultado completo</caption>
      <thead><tr>{data.columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
      <tbody>{data.rows.map((row, index) => <tr key={index}>{data.columns.map(column => <td key={column.key}>{formatReportCell(row[column.key], column)}</td>)}</tr>)}</tbody>
      {Object.keys(data.totals).length > 0 && <tfoot><tr>{data.columns.map((column, index) => <td key={column.key}>{data.totals[column.key] !== undefined ? formatReportCell(data.totals[column.key], column) : index === 0 ? 'TOTAL' : ''}</td>)}</tr></tfoot>}
    </table>
  </article>, document.body)
}
