import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Lock,
  PencilSimple,
  Trash,
  Users,
} from 'phosphor-react-native';
import { Entry } from '../lib/db';

type EntryActionPanelProps = {
  entry: Entry;
  onEdit: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
};

export function EntryActionPanel({
  entry,
  onEdit,
  onToggleVisibility,
  onDelete,
}: EntryActionPanelProps) {
  const nextIsShared = entry.visibility === 'private';
  const visibilityLabel = nextIsShared ? 'ふたりへ共有' : '自分のみにする';

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.editButton} onPress={onEdit} activeOpacity={0.65}>
        <PencilSimple size={15} color="#555" weight="regular" />
        <Text style={styles.editButtonText}>編集</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.visibilityButton,
          nextIsShared ? styles.sharedButton : styles.privateButton,
        ]}
        onPress={onToggleVisibility}
        activeOpacity={0.65}
      >
        {nextIsShared ? (
          <Users size={15} color="#7B9E87" weight="fill" />
        ) : (
          <Lock size={15} color="#555" weight="fill" />
        )}
        <Text
          style={[
            styles.visibilityButtonText,
            nextIsShared ? styles.sharedButtonText : styles.privateButtonText,
          ]}
        >
          {visibilityLabel}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteButton} onPress={onDelete} activeOpacity={0.65}>
        <Trash size={15} color="#E57373" weight="regular" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 18,
    marginTop: -4,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderRadius: 12,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#FAFAF8',
  },
  editButtonText: { fontSize: 12, color: '#555', fontWeight: '700' },
  visibilityButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sharedButton: {
    backgroundColor: '#EDF4F0',
    borderColor: '#C8D8CC',
  },
  privateButton: {
    backgroundColor: '#F0F0F0',
    borderColor: '#E0E0E0',
  },
  visibilityButtonText: { fontSize: 12, fontWeight: '700' },
  sharedButtonText: { color: '#7B9E87' },
  privateButtonText: { color: '#555' },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF6F6',
    borderWidth: 1,
    borderColor: '#F4D7D7',
  },
});
