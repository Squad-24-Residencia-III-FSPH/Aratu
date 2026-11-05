import type { ReactNode } from 'react'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'

/** Definição de coluna da tabela reutilizável. */
export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
}

export interface DataTableProps<T> {
  caption: string
  columns: readonly DataTableColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  renderActions?: (row: T) => ReactNode
  busy?: boolean
}

/** Tabela acessível com cabeçalho semântico, legenda e rolagem focável. */
export default function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  renderActions,
  busy,
}: DataTableProps<T>) {
  const columnCount = columns.length + (renderActions ? 1 : 0)

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <TableContainer
        role="region"
        aria-label={`${caption}. Use a rolagem horizontal para percorrer as colunas.`}
        aria-busy={busy ? 'true' : undefined}
        tabIndex={0}
        sx={{
          overflowX: 'auto',
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: '-2px',
          },
        }}
      >
        <Table aria-label={caption} sx={{ minWidth: 960 }}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  component="th"
                  scope="col"
                  align={column.align ?? 'left'}
                  sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  {column.header}
                </TableCell>
              ))}
              {renderActions && (
                <TableCell component="th" scope="col" align="right" sx={{ fontWeight: 700 }}>
                  Ações
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} align="center" sx={{ py: 4 }}>
                  Nenhum veículo para exibir.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={rowKey(row)} hover>
                  {columns.map((column) => (
                    <TableCell key={column.key} align={column.align ?? 'left'}>
                      {column.render(row)}
                    </TableCell>
                  ))}
                  {renderActions && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {renderActions(row)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
