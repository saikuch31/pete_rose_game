import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from import_players_supabase import SupabaseTable, prepare_players, run_import


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / 'players.csv'
        self.review = Path(self.temp.name) / 'review.csv'
        self.source.write_text('Name,Alternative positions\n Existing Player,\nVirgil  van Dijk,CB\nvirgil van dijk,CB\nNeymar,LW\n,\nOther Player,\n')
        self.existing = [{'import_id': 50, 'normalized_name': 'existing player'}]

    def test_cleanup_duplicates_and_database_types(self):
        rows, singles, duplicates, invalid = prepare_players(self.source, self.existing, 'Football')
        self.assertEqual([r['import_id'] for r in rows], [51, 52])
        self.assertEqual(rows[0]['last_name'], 'van Dijk')
        self.assertEqual(rows[0]['alternate_names'], [])
        self.assertIs(rows[0]['is_professional'], True)
        self.assertEqual((duplicates, invalid), (2, 1))
        self.assertEqual(singles[0]['Name'], 'Neymar')

    def test_dry_run_never_writes(self):
        table = Mock()
        table.existing.return_value = self.existing
        with contextlib.redirect_stdout(io.StringIO()):
            run_import(table, self.source, self.review, dry_run=True)
        table.insert.assert_not_called()
        self.assertFalse(self.review.exists())

    def test_batches_and_review(self):
        table = Mock()
        table.existing.return_value = self.existing
        with contextlib.redirect_stdout(io.StringIO()):
            run_import(table, self.source, self.review, batch_size=1)
        self.assertEqual(table.insert.call_count, 2)
        self.assertIn('Neymar', self.review.read_text())

    def test_failure_reports_confirmed_progress(self):
        table = Mock()
        table.existing.return_value = self.existing
        table.insert.side_effect = [None, RuntimeError('HTTP 409')]
        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, '1 inserts confirmed'):
                run_import(table, self.source, self.review, batch_size=1)

    def test_pagination_handles_server_page_cap(self):
        table = SupabaseTable('https://example.supabase.co', 'sb_secret_test')
        table.request = Mock(side_effect=[self.existing, [{'import_id': 51}], []])
        self.assertEqual(len(table.existing()), 2)
        offsets = [call.kwargs['params']['offset'] for call in table.request.call_args_list]
        self.assertEqual(offsets, [0, 1, 2])

    @patch('import_players_supabase.urlopen')
    def test_insert_sends_secret_in_apikey_and_typed_json(self, open_url):
        open_url.return_value.__enter__.return_value.read.return_value = b''
        table = SupabaseTable('https://example.supabase.co', 'sb_secret_test')
        rows, *_ = prepare_players(self.source, self.existing, 'Football')
        table.insert(rows)
        request = open_url.call_args.args[0]
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(request.get_header('Apikey'), 'sb_secret_test')
        self.assertIsNone(request.get_header('Authorization'))
        self.assertEqual(json.loads(request.data), rows)

    def test_missing_name_column(self):
        self.source.write_text('Wrong\nSomeone\n')
        with self.assertRaisesRegex(ValueError, 'Name column'):
            prepare_players(self.source, [], 'Football')


if __name__ == '__main__':
    unittest.main()
