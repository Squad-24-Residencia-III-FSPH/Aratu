import { createPortal } from 'react-dom'
import { REPORT_MODULE_LABELS, type ReportColumn, type ReportPrintData } from '../../reports/reportTypes'
import { formatReportCell } from '../../reports/reportPresentation'
import { formatAppliedFiltersText, formatReportIssuedAt, formatReportPeriod } from './reportHelpers'
import styles from './ReportsPage.module.css'

function alignmentClass(column: ReportColumn): string {
  if (column.align === 'right' || column.type === 'currency' || column.type === 'number') return styles.alignRight
  if (column.align === 'center') return styles.alignCenter
  return styles.alignLeft
}

function cellClassName(column: ReportColumn): string {
  const noWrap = column.type === 'currency'
    || column.type === 'number'
    || column.type === 'date'
    || column.type === 'datetime'
    || column.type === 'boolean'
  return `${alignmentClass(column)} ${noWrap ? styles.printNoWrapCell : styles.printTextCell}`
}

/**
 * Resultado completo autorizado preparado para o diálogo nativo de impressão,
 * com identificação institucional repetida por página e proteção contra quebra de valores.
 */
export default function ReportPrintView({ data }: { data: ReportPrintData }) {
  const periodLabel = formatReportPeriod(data.period)
  const issuedAtLabel = formatReportIssuedAt(data.generatedAt)
  const filtersLabel = formatAppliedFiltersText(data.appliedFilters)
  const moduleLabel = REPORT_MODULE_LABELS[data.module] ?? data.module

  return createPortal(
    <article className={styles.printRoot} aria-label="Versão preparada para impressão">
      <div className={styles.printPageLayout}>
        <header className={styles.printRepeatBanner}>
          <div className={styles.printRepeatInner}>
            <strong>Fundação de Saúde Parreiras Horta — FSPH / SVO</strong>
            <p className={styles.printRepeatMeta}>
              {data.title} · Período: {periodLabel}
              {data.appliedFilters.length > 0 ? ` · ${filtersLabel}` : ''} · Emitido por {data.generatedBy.name} em {issuedAtLabel}
            </p>
          </div>
        </header>

        <div className={styles.printBodyGroup}>
          <section className={styles.printSummary}>
            <h1>{data.title}</h1>
            <p>Módulo: {moduleLabel} · Período: {periodLabel}</p>
            <p>Filtros aplicados: {filtersLabel}</p>
            <p>
              Emitido por {data.generatedBy.name} em {issuedAtLabel} · {data.totalCount}{' '}
              {data.totalCount === 1 ? 'registro' : 'registros'}
            </p>
          </section>

          <table>
            <caption>{data.title} — versão preparada para impressão ({periodLabel})</caption>
            <thead>
              <tr>
                {data.columns.map(column => (
                  <th scope="col" key={column.key} className={alignmentClass(column)}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={index}>
                  {data.columns.map(column => (
                    <td key={column.key} className={cellClassName(column)}>
                      {formatReportCell(row[column.key], column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {Object.keys(data.totals).length > 0 && (
              <tfoot>
                <tr>
                  {data.columns.map((column, index) => {
                    const hasTotal = data.totals[column.key] !== undefined
                    const isFirstLabel = !hasTotal && index === 0
                    const cellClass = hasTotal
                      ? `${alignmentClass(column)} ${styles.printNoWrapCell}`
                      : `${alignmentClass(column)} ${styles.printTextCell}`
                    return (
                      <td key={column.key} className={cellClass}>
                        {hasTotal
                          ? formatReportCell(data.totals[column.key], column)
                          : isFirstLabel ? 'TOTAL' : ''}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </article>,
    document.body,
  )
}
